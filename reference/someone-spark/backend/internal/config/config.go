package config

import (
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Env                    string
	Root                   string
	HTTPAddr               string
	WorkerHealthAddr       string
	TrustedProxies         []string
	SitePublicURL          string
	SiteName               string
	SessionKey             []byte
	CookieSecure           bool
	CookieDomain           string
	MySQLDSN               string
	RedisAddr              string
	RedisPassword          string
	RedisDB                int
	BootstrapAdminEmail    string
	BootstrapAdminPassword string
	DevMail                string
	SMTPHost               string
	SMTPPort               int
	SMTPUser               string
	SMTPPassword           string
	SMTPFrom               string
	SidecarPy              string
	SidecarPyScript        string
	SidecarNode            string
	SidecarNodeScript      string
	MediaDir               string
	LogDir                 string
	TmpDir                 string
	PlaywrightDir          string
	SidecarHome            string
	Adapter                string
	LicenseFile            string
}

var errMissingSessionKey = errors.New("未设置 HUOHUA_SESSION_KEY")

func Load() (*Config, error) {
	loadedEnv, triedEnv, examples, err := loadDotEnv()
	if err != nil {
		return nil, err
	}
	logEnvProbe(loadedEnv, triedEnv, examples)
	root, probe, err := resolveRoot()
	if err != nil {
		return nil, err
	}
	pyBin, pyScript, nodeBin, nodeScript, err := resolveSidecars(root, probe)
	if err != nil {
		return nil, err
	}
	key, err := loadSessionKey(root)
	if err != nil {
		return nil, sessionKeyErr(err, loadedEnv, triedEnv, examples)
	}
	smtpPort := 587
	if v := os.Getenv("HUOHUA_SMTP_PORT"); v != "" {
		p, err := strconv.Atoi(v)
		if err != nil {
			return nil, fmt.Errorf("HUOHUA_SMTP_PORT 不是合法端口号：%w", err)
		}
		smtpPort = p
	}
	redisDB := 0
	if v := os.Getenv("HUOHUA_REDIS_DB"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return nil, fmt.Errorf("HUOHUA_REDIS_DB 不是合法整数：%w", err)
		}
		redisDB = n
	}
	cfg := &Config{
		Env:                    getenv("HUOHUA_ENV", "development"),
		Root:                   root,
		HTTPAddr:               getenv("HUOHUA_HTTP_ADDR", "127.0.0.1:8080"),
		WorkerHealthAddr:       getenv("HUOHUA_WORKER_HEALTH_ADDR", "127.0.0.1:8081"),
		TrustedProxies:         splitCSV(getenv("HUOHUA_TRUSTED_PROXIES", "127.0.0.1,::1")),
		SitePublicURL:          strings.TrimRight(getenv("HUOHUA_SITE_PUBLIC_URL", "http://127.0.0.1:8080"), "/"),
		SiteName:               getenv("HUOHUA_SITE_NAME", "火花"),
		SessionKey:             key,
		CookieSecure:           getenv("HUOHUA_COOKIE_SECURE", "false") == "true",
		CookieDomain:           hostOnlyCookieDomain(os.Getenv("HUOHUA_COOKIE_DOMAIN")),
		MySQLDSN:               os.Getenv("HUOHUA_MYSQL_DSN"),
		RedisAddr:              getenv("HUOHUA_REDIS_ADDR", "127.0.0.1:6379"),
		RedisPassword:          os.Getenv("HUOHUA_REDIS_PASSWORD"),
		RedisDB:                redisDB,
		BootstrapAdminEmail:    strings.ToLower(strings.TrimSpace(os.Getenv("HUOHUA_BOOTSTRAP_ADMIN_EMAIL"))),
		BootstrapAdminPassword: os.Getenv("HUOHUA_BOOTSTRAP_ADMIN_PASSWORD"),
		DevMail:                getenv("HUOHUA_DEV_MAIL", ""),
		SMTPHost:               os.Getenv("HUOHUA_SMTP_HOST"),
		SMTPPort:               smtpPort,
		SMTPUser:               os.Getenv("HUOHUA_SMTP_USER"),
		SMTPPassword:           os.Getenv("HUOHUA_SMTP_PASSWORD"),
		SMTPFrom:               os.Getenv("HUOHUA_SMTP_FROM"),
		SidecarPy:              pyBin,
		SidecarPyScript:        pyScript,
		SidecarNode:            nodeBin,
		SidecarNodeScript:      nodeScript,
		MediaDir:               resolveUnder(root, envPath("HUOHUA_MEDIA_DIR"), filepath.Join("var", "media")),
		LogDir:                 resolveUnder(root, envPath("HUOHUA_LOG_DIR"), filepath.Join("var", "log")),
		TmpDir:                 resolveUnder(root, envPath("HUOHUA_TMP_DIR"), filepath.Join("var", "tmp")),
		PlaywrightDir:          resolveUnder(root, envPath("PLAYWRIGHT_BROWSERS_PATH"), filepath.Join("worker-py", ".ms-playwright")),
		SidecarHome:            resolveSidecarHome(root),
		Adapter:                getenv("HUOHUA_ADAPTER", "live"),
		LicenseFile:            resolveUnder(root, envPath("HUOHUA_LICENSE_FILE"), ""),
	}
	if raw := strings.TrimSpace(os.Getenv("HUOHUA_COOKIE_DOMAIN")); raw != "" && cfg.CookieDomain == "" {
		slog.Warn("已忽略 HUOHUA_COOKIE_DOMAIN（IP/localhost 不能作为 Cookie Domain，改用 host-only）", "raw", raw)
	}
	if cfg.MySQLDSN == "" {
		return nil, fmt.Errorf("未设置 HUOHUA_MYSQL_DSN。请在 .env 中填写 MySQL 连接串，例如 huohua:密码@tcp(127.0.0.1:3306)/huohua?parseTime=true&loc=UTC&charset=utf8mb4")
	}
	if len(cfg.SessionKey) != 32 {
		return nil, fmt.Errorf("HUOHUA_SESSION_KEY 解码后必须是 32 字节（填 64 位 hex 或 32 个字符的原文）")
	}
	return cfg, nil
}

func (c *Config) Production() bool {
	return c.Env == "production"
}

func hostOnlyCookieDomain(raw string) string {
	d := strings.TrimSpace(raw)
	d = strings.Trim(d, ".")
	if d == "" {
		return ""
	}
	lower := strings.ToLower(d)
	if lower == "localhost" || lower == "127.0.0.1" || lower == "::1" || lower == "[::1]" {
		return ""
	}
	if ip := net.ParseIP(d); ip != nil {
		return ""
	}
	if strings.Contains(d, "/") || strings.Contains(d, ":") {
		return ""
	}
	return d
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func envPath(key string) string {
	return sanitizeEnvValue(os.Getenv(key))
}

func loadSessionKey(root string) ([]byte, error) {
	if path := envPath("HUOHUA_SESSION_KEY_FILE"); path != "" {
		path = resolveUnder(root, path, "")
		raw, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("无法读取 HUOHUA_SESSION_KEY_FILE（%s）：%w。请确认文件存在且运行用户有读权限", path, err)
		}
		return parseKey(sanitizeEnvValue(string(raw)))
	}
	return parseKey(sanitizeEnvValue(os.Getenv("HUOHUA_SESSION_KEY")))
}

func parseKey(s string) ([]byte, error) {
	if s == "" {
		return nil, errMissingSessionKey
	}
	if len(s) == 64 {
		b, err := hex.DecodeString(s)
		if err != nil {
			return nil, fmt.Errorf("HUOHUA_SESSION_KEY 不是有效的 64 位十六进制：%w。请用 openssl rand -hex 32 重新生成", err)
		}
		return b, nil
	}
	if len(s) == 32 {
		return []byte(s), nil
	}
	return nil, fmt.Errorf("HUOHUA_SESSION_KEY 格式不对：需要 64 位 hex（推荐 openssl rand -hex 32）或恰好 32 个字符的原文，当前长度 %d。不要用 openssl rand -base64", len(s))
}

func sessionKeyErr(err error, loaded string, tried, examples []string) error {
	if !errors.Is(err, errMissingSessionKey) {
		return err
	}
	hint := "若只改了 .env.example，请复制为 .env（进程不会读取 .env.example）。写入 HUOHUA_SESSION_KEY（推荐：openssl rand -hex 32）。查找顺序：HUOHUA_ENV_FILE、当前目录 ./.env、可执行文件同目录、上一级 backend/.env、部署根 .env。宝塔请选「从文件加载」并指向 .env 绝对路径，或在「指定变量」里单独加 HUOHUA_SESSION_KEY。"
	if loaded != "" {
		return fmt.Errorf("%w（已加载 %s，但其中没有该键或值为空）。%s", err, loaded, hint)
	}
	if len(examples) > 0 {
		return fmt.Errorf("%w（未找到 .env，已尝试：%s。发现模板 %s，若只改了 .env.example，请复制为 .env）。%s", err, strings.Join(tried, "、"), strings.Join(examples, "、"), hint)
	}
	if len(tried) > 0 {
		return fmt.Errorf("%w（未找到 .env，已尝试：%s）。%s", err, strings.Join(tried, "、"), hint)
	}
	return fmt.Errorf("%w。%s", err, hint)
}

func logEnvProbe(loaded string, tried, examples []string) {
	loadedLabel := "(未找到 .env)"
	if loaded != "" {
		loadedLabel = loaded
	}
	keySrc := "missing"
	if sanitizeEnvValue(os.Getenv("HUOHUA_SESSION_KEY_FILE")) != "" {
		keySrc = "file"
	} else if sanitizeEnvValue(os.Getenv("HUOHUA_SESSION_KEY")) != "" {
		keySrc = "env"
	}
	exampleLabel := "(无)"
	if len(examples) > 0 {
		exampleLabel = strings.Join(examples, " | ")
	}
	slog.Info("env 探测", "tried", strings.Join(tried, " | "), "loaded", loadedLabel, "session_key", keySrc, "env_example_nearby", exampleLabel)
}

func sanitizeEnvValue(s string) string {
	s = strings.Trim(strings.TrimPrefix(s, "\ufeff"), " \t\r\n\u3000")
	pairs := [][2]string{{`"`, `"`}, {`'`, `'`}, {"\u201c", "\u201d"}, {"\u2018", "\u2019"}, {"\u300c", "\u300d"}}
	for _, p := range pairs {
		if strings.HasPrefix(s, p[0]) {
			rest := s[len(p[0]):]
			if i := strings.Index(rest, p[1]); i >= 0 {
				return strings.Trim(rest[:i], " \t\r\n\u3000")
			}
		}
	}
	if i := strings.Index(s, " #"); i >= 0 {
		s = strings.TrimSpace(s[:i])
	}
	return s
}

func loadDotEnv() (string, []string, []string, error) {
	tried := envFileCandidates()
	examples := nearbyEnvExamples(tried)
	for _, p := range tried {
		st, err := os.Stat(p)
		if err != nil || st.IsDir() {
			continue
		}
		if err := applyDotEnvFile(p); err != nil {
			return "", tried, examples, fmt.Errorf("无法加载环境文件 %s：%w。请确认路径正确且运行用户可读", p, err)
		}
		return p, tried, examples, nil
	}
	return "", tried, examples, nil
}

func applyDotEnvFile(p string) error {
	raw, err := os.ReadFile(p)
	if err != nil {
		return err
	}
	m, err := godotenv.Unmarshal(strings.TrimPrefix(string(raw), "\ufeff"))
	if err != nil {
		return err
	}
	for k, v := range m {
		if cur, ok := os.LookupEnv(k); ok && strings.TrimSpace(cur) != "" {
			continue
		}
		if err := os.Setenv(k, v); err != nil {
			return err
		}
	}
	return nil
}

func nearbyEnvExamples(envPaths []string) []string {
	var raw []string
	for _, p := range envPaths {
		raw = append(raw, filepath.Join(filepath.Dir(p), ".env.example"))
	}
	if cwd, err := os.Getwd(); err == nil {
		raw = append(raw, filepath.Join(cwd, ".env.example"), filepath.Join(filepath.Dir(cwd), ".env.example"))
	}
	if dir := executableDir(); dir != "" {
		raw = append(raw, filepath.Join(dir, ".env.example"), filepath.Join(filepath.Dir(dir), ".env.example"))
	}
	var out []string
	for _, p := range uniqueAbs(raw) {
		if fileExists(p) {
			out = append(out, p)
		}
	}
	return out
}

func envFileCandidates() []string {
	var raw []string
	if p := strings.TrimSpace(os.Getenv("HUOHUA_ENV_FILE")); p != "" {
		raw = append(raw, p)
	}
	raw = append(raw, ".env")
	if dir := executableDir(); dir != "" {
		raw = append(raw, filepath.Join(dir, ".env"))
		raw = append(raw, filepath.Join(filepath.Dir(dir), ".env"))
	}
	if root, _ := discoverDeployRoot(); root != "" {
		raw = append(raw, filepath.Join(root, "backend", ".env"))
		raw = append(raw, filepath.Join(root, ".env"))
	}
	return uniqueAbs(raw)
}

func resolveRoot() (string, []string, error) {
	probe := searchDirs(probeBases())
	if v := envPath("HUOHUA_ROOT"); v != "" {
		cand, err := normalizeRootCandidate(v)
		if err != nil {
			return "", probe, fmt.Errorf("HUOHUA_ROOT 无效：%w", err)
		}
		if found := nearestDeployRoot(cand); found != "" {
			return found, probe, nil
		}
		if found := firstDeployRoot(probe); found != "" && cand != found && pathHasPrefix(cand, found) {
			return found, probe, nil
		}
		return cand, probe, nil
	}
	if root, tried := discoverDeployRoot(); root != "" {
		return root, tried, nil
	}
	return "", probe, fmt.Errorf("无法自动探测部署根 HUOHUA_ROOT（应含 worker-py 与 protocol-node）。已尝试：%s。可留空并保证上传包结构完整，或设置 HUOHUA_ROOT 为部署根（不要写死别人的 /www/wwwroot 路径）", strings.Join(probe, "、"))
}

func resolveSidecars(root string, probe []string) (pyBin, pyScript, nodeBin, nodeScript string, err error) {
	pyScript = resolveUnder(root, envPath("HUOHUA_SIDECAR_PY_SCRIPT"), filepath.Join("worker-py", "main.py"))
	nodeScript = resolveUnder(root, envPath("HUOHUA_SIDECAR_NODE_SCRIPT"), filepath.Join("protocol-node", "index.mjs"))
	pyBin = resolvePython(root)
	if v := envPath("HUOHUA_SIDECAR_NODE"); v != "" {
		nodeBin = v
	} else {
		nodeBin = "node"
	}
	if !fileExists(pyScript) {
		return "", "", "", "", fmt.Errorf("找不到 Python sidecar 脚本 %s。已探测：%s。请确认上传了 worker-py/，或设置 HUOHUA_SIDECAR_PY_SCRIPT", pyScript, strings.Join(probe, "、"))
	}
	if !fileExists(nodeScript) {
		return "", "", "", "", fmt.Errorf("找不到 Node sidecar 脚本 %s。已探测：%s。请确认上传了 protocol-node/，或设置 HUOHUA_SIDECAR_NODE_SCRIPT", nodeScript, strings.Join(probe, "、"))
	}
	return pyBin, pyScript, nodeBin, nodeScript, nil
}

func resolvePython(root string) string {
	var cands []string
	if v := envPath("HUOHUA_SIDECAR_PY"); v != "" {
		cands = append(cands, v)
	}
	venv := resolveUnder(root, "", filepath.Join("worker-py", ".venv"))
	cands = append(cands,
		filepath.Join(venv, "bin", "python"),
		filepath.Join(venv, "Scripts", "python.exe"),
		"python3",
		"python",
	)
	for _, c := range cands {
		if p := lookupExec(root, c); p != "" {
			return p
		}
	}
	return ""
}

func lookupExec(root, name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return ""
	}
	if isAbsPath(name) {
		name = filepath.Clean(name)
		if fileExists(name) {
			return name
		}
		return ""
	}
	if strings.ContainsAny(name, `/\`) {
		if p := resolveUnder(root, name, ""); p != "" && fileExists(p) {
			return p
		}
		return ""
	}
	if p, err := exec.LookPath(name); err == nil {
		return p
	}
	return ""
}

func ResolvePython(root string) string {
	return resolvePython(root)
}

func VenvPython(root string) string {
	base := resolveUnder(root, "", filepath.Join("worker-py", ".venv"))
	if runtime.GOOS == "windows" {
		return filepath.Join(base, "Scripts", "python.exe")
	}
	return filepath.Join(base, "bin", "python")
}

func FindSystemPython() string {
	if p := lookupExec("", "python3"); p != "" {
		return p
	}
	return lookupExec("", "python")
}

func SeedPython(root string) string {
	if v := envPath("HUOHUA_SIDECAR_PY"); v != "" {
		if p := lookupExec(root, v); p != "" {
			return p
		}
	}
	return FindSystemPython()
}

func ResolveUnder(root, val, def string) string {
	return resolveUnder(root, val, def)
}

func JoinUnder(root, dir string, elem ...string) string {
	base := resolveUnder(root, dir, "")
	if base == "" {
		base = root
	}
	if len(elem) == 0 {
		return base
	}
	return filepath.Join(append([]string{base}, elem...)...)
}

func FileExists(p string) bool {
	return fileExists(p)
}

func resolveUnder(root, val, def string) string {
	p := strings.TrimSpace(val)
	if p == "" {
		p = def
	}
	if p == "" {
		return ""
	}
	root = strings.TrimSpace(root)
	if root != "" {
		root = filepath.Clean(root)
	}
	if isAbsPath(p) {
		return collapseStacked(filepath.Clean(p), root)
	}
	if abs := absIfRepeatsRoot(root, p); abs != "" {
		return collapseStacked(abs, root)
	}
	if root == "" {
		return filepath.Clean(p)
	}
	return collapseStacked(filepath.Clean(filepath.Join(root, p)), root)
}

func isAbsPath(p string) bool {
	if p == "" {
		return false
	}
	if filepath.IsAbs(p) || strings.HasPrefix(p, "/") {
		return true
	}
	if len(p) >= 3 && p[1] == ':' && (p[2] == '/' || p[2] == '\\') {
		c := p[0]
		return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z')
	}
	return false
}

func slashPath(p string) string {
	return strings.TrimRight(filepath.ToSlash(filepath.Clean(p)), "/")
}

func pathHasPrefix(p, prefix string) bool {
	ps, pre := slashPath(p), slashPath(prefix)
	if pre == "" || ps == "" {
		return false
	}
	return ps == pre || strings.HasPrefix(ps, pre+"/")
}

func absIfRepeatsRoot(root, p string) string {
	if root == "" || p == "" {
		return ""
	}
	rootBare := strings.TrimPrefix(slashPath(root), "/")
	pBare := strings.Trim(filepath.ToSlash(strings.TrimSpace(p)), "/")
	if rootBare == "" || pBare == "" {
		return ""
	}
	if pBare == rootBare || strings.HasPrefix(pBare, rootBare+"/") {
		return filepath.Clean("/" + pBare)
	}
	return ""
}

func collapseStacked(p, root string) string {
	p = filepath.Clean(p)
	if root == "" {
		return p
	}
	root = filepath.Clean(root)
	ps, rs := slashPath(p), slashPath(root)
	rsBare := strings.TrimPrefix(rs, "/")
	if rsBare == "" {
		return p
	}
	doubled := rs + "/" + rsBare
	if ps == doubled {
		return root
	}
	if strings.HasPrefix(ps, doubled+"/") {
		return filepath.Clean(filepath.Join(root, filepath.FromSlash(strings.TrimPrefix(ps, doubled+"/"))))
	}
	return p
}

func normalizeRootCandidate(v string) (string, error) {
	v = strings.TrimSpace(v)
	if v == "" {
		return "", fmt.Errorf("空路径")
	}
	if isAbsPath(v) {
		return filepath.Clean(v), nil
	}
	if looksLikeAbsMissingSlash(v) {
		return filepath.Clean("/" + strings.TrimPrefix(filepath.ToSlash(v), "/")), nil
	}
	abs, err := filepath.Abs(v)
	if err != nil {
		return "", err
	}
	return filepath.Clean(abs), nil
}

func looksLikeAbsMissingSlash(v string) bool {
	s := strings.TrimPrefix(filepath.ToSlash(strings.TrimSpace(v)), "./")
	return s == "www/wwwroot" || strings.HasPrefix(s, "www/wwwroot/")
}

func nearestDeployRoot(start string) string {
	dir := filepath.Clean(start)
	for i := 0; i < 12; i++ {
		if looksLikeDeployRoot(dir) {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return ""
}

func firstDeployRoot(dirs []string) string {
	for _, dir := range dirs {
		if looksLikeDeployRoot(dir) {
			return dir
		}
	}
	return ""
}

func resolveSidecarHome(root string) string {
	if v := envPath("HUOHUA_SIDECAR_HOME"); v != "" {
		return resolveUnder(root, v, "")
	}
	cur := strings.TrimSpace(os.Getenv("HOME"))
	if cur == "" || cur == "/root" || !dirWritable(cur) {
		return resolveUnder(root, "", "worker-py")
	}
	return filepath.Clean(cur)
}

func dirWritable(dir string) bool {
	if dir == "" || !dirExists(dir) {
		return false
	}
	f, err := os.CreateTemp(dir, ".huohua-w-*")
	if err != nil {
		return false
	}
	name := f.Name()
	_ = f.Close()
	_ = os.Remove(name)
	return true
}

func discoverDeployRoot() (string, []string) {
	tried := searchDirs(probeBases())
	for _, dir := range tried {
		if looksLikeDeployRoot(dir) {
			return dir, tried
		}
	}
	return "", tried
}

func probeBases() []string {
	var raw []string
	if dir := executableDir(); dir != "" {
		raw = append(raw, dir, filepath.Dir(dir), filepath.Dir(filepath.Dir(dir)))
	}
	if cwd, err := os.Getwd(); err == nil {
		raw = append(raw, cwd, filepath.Dir(cwd), filepath.Dir(filepath.Dir(cwd)))
	}
	return uniqueAbs(raw)
}

func searchDirs(bases []string) []string {
	var extra []string
	for _, b := range bases {
		extra = append(extra, filepath.Dir(b))
		if looksLikeBackend(b) {
			extra = append(extra, filepath.Dir(b))
		}
	}
	return uniqueAbs(append(append([]string{}, bases...), extra...))
}

func looksLikeDeployRoot(dir string) bool {
	return dirExists(filepath.Join(dir, "worker-py")) && dirExists(filepath.Join(dir, "protocol-node"))
}

func looksLikeBackend(dir string) bool {
	return dirExists(filepath.Join(dir, "migrations")) || fileExists(filepath.Join(dir, ".env.example")) || fileExists(filepath.Join(dir, "go.mod"))
}

func executableDir() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	return filepath.Dir(exe)
}

func uniqueAbs(in []string) []string {
	seen := make(map[string]struct{}, len(in))
	out := make([]string, 0, len(in))
	for _, s := range in {
		if strings.TrimSpace(s) == "" {
			continue
		}
		abs, err := filepath.Abs(s)
		if err != nil {
			abs = filepath.Clean(s)
		}
		if _, ok := seen[abs]; ok {
			continue
		}
		seen[abs] = struct{}{}
		out = append(out, abs)
	}
	return out
}

func fileExists(p string) bool {
	st, err := os.Stat(p)
	return err == nil && !st.IsDir()
}

func dirExists(p string) bool {
	st, err := os.Stat(p)
	return err == nil && st.IsDir()
}

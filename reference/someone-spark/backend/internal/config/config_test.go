package config

import (
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestHostOnlyCookieDomain(t *testing.T) {
	if hostOnlyCookieDomain("127.0.0.1") != "" {
		t.Fatal("127.0.0.1")
	}
	if hostOnlyCookieDomain("localhost") != "" {
		t.Fatal("localhost")
	}
	if hostOnlyCookieDomain("::1") != "" {
		t.Fatal("::1")
	}
	if hostOnlyCookieDomain("") != "" {
		t.Fatal("empty")
	}
	if got := hostOnlyCookieDomain("douyin.ovim.cn"); got != "douyin.ovim.cn" {
		t.Fatalf("host: %s", got)
	}
}

func TestParseKeyHex64(t *testing.T) {
	raw := strings.Repeat("ab", 32)
	got, err := parseKey(raw)
	if err != nil {
		t.Fatal(err)
	}
	want, err := hex.DecodeString(raw)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(want) || len(got) != 32 {
		t.Fatalf("got %d bytes", len(got))
	}
}

func TestParseKeyRaw32(t *testing.T) {
	raw := strings.Repeat("k", 32)
	got, err := parseKey(raw)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != raw {
		t.Fatal("raw 32-byte key mismatch")
	}
}

func TestParseKeyRejectsEmptyAndBase64(t *testing.T) {
	if _, err := parseKey(""); !errors.Is(err, errMissingSessionKey) {
		t.Fatalf("empty: %v", err)
	}
	if _, err := parseKey("dGVzdA=="); err == nil {
		t.Fatal("base64 should be rejected")
	}
}

func TestSanitizeEnvValue(t *testing.T) {
	hexKey := strings.Repeat("ab", 32)
	if got := sanitizeEnvValue("\ufeff" + hexKey); got != hexKey {
		t.Fatalf("bom: %q", got)
	}
	if got := sanitizeEnvValue("\u201c" + hexKey + "\u201d"); got != hexKey {
		t.Fatalf("cn quotes: %q", got)
	}
	if got := sanitizeEnvValue(`"` + hexKey + `" # comment`); got != hexKey {
		t.Fatalf("quoted comment: %q", got)
	}
	if got := sanitizeEnvValue(hexKey + " # trailing"); got != hexKey {
		t.Fatalf("inline comment: %q", got)
	}
}

func TestSessionKeyErrMentionsExampleCopy(t *testing.T) {
	err := sessionKeyErr(errMissingSessionKey, "", []string{"/tmp/.env"}, []string{"/tmp/.env.example"})
	if err == nil || !strings.Contains(err.Error(), "若只改了 .env.example，请复制为 .env") {
		t.Fatalf("hint missing: %v", err)
	}
}

func TestApplyDotEnvFillsEmpty(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, ".env")
	hexKey := strings.Repeat("cd", 32)
	if err := os.WriteFile(p, []byte("\ufeffHUOHUA_SESSION_KEY="+hexKey+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("HUOHUA_SESSION_KEY", "")
	if err := applyDotEnvFile(p); err != nil {
		t.Fatal(err)
	}
	if got := os.Getenv("HUOHUA_SESSION_KEY"); got != hexKey {
		t.Fatalf("empty env should be filled from file, got len=%d", len(got))
	}
}

func TestEnvFileCandidatesOrder(t *testing.T) {
	t.Setenv("HUOHUA_ENV_FILE", filepath.Join(t.TempDir(), "custom.env"))
	got := envFileCandidates()
	if len(got) < 2 {
		t.Fatalf("candidates: %v", got)
	}
	if !strings.HasSuffix(got[0], "custom.env") {
		t.Fatalf("HUOHUA_ENV_FILE should be first: %v", got)
	}
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if got[1] != filepath.Join(cwd, ".env") {
		t.Fatalf("cwd .env should be second: %v", got)
	}
}

func TestLooksLikeDeployRoot(t *testing.T) {
	root := t.TempDir()
	if looksLikeDeployRoot(root) {
		t.Fatal("empty dir should not be deploy root")
	}
	if err := os.Mkdir(filepath.Join(root, "worker-py"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(root, "protocol-node"), 0o755); err != nil {
		t.Fatal(err)
	}
	if !looksLikeDeployRoot(root) {
		t.Fatal("expected deploy root")
	}
}

func TestResolveUnder(t *testing.T) {
	root := t.TempDir()
	got := resolveUnder(root, "", filepath.Join("var", "tmp"))
	if got != filepath.Join(root, "var", "tmp") {
		t.Fatalf("default: %s", got)
	}
	got = resolveUnder(root, filepath.Join("rel", "x"), "ignored")
	if got != filepath.Join(root, "rel", "x") {
		t.Fatalf("rel: %s", got)
	}
	abs := filepath.Join(root, "abs")
	if resolveUnder(root, abs, "") != filepath.Clean(abs) {
		t.Fatalf("abs: %s", resolveUnder(root, abs, ""))
	}
}

func TestResolveUnderNoDouble(t *testing.T) {
	root := "/www/wwwroot/huohua"
	want := filepath.Clean("/www/wwwroot/huohua/var/tmp")
	cases := []string{
		"/www/wwwroot/huohua/var/tmp",
		"www/wwwroot/huohua/var/tmp",
		"/www/wwwroot/huohua/www/wwwroot/huohua/var/tmp",
	}
	for _, in := range cases {
		got := resolveUnder(root, in, "")
		if got != want {
			t.Fatalf("%q -> %s want %s", in, got, want)
		}
	}
	got := resolveUnder(root, "", filepath.Join("var", "tmp"))
	if got != filepath.Join(filepath.Clean(root), "var", "tmp") {
		t.Fatalf("default: %s", got)
	}
	pw := resolveUnder(root, "www/wwwroot/huohua/worker-py/.ms-playwright", "")
	if pw != filepath.Clean("/www/wwwroot/huohua/worker-py/.ms-playwright") {
		t.Fatalf("playwright: %s", pw)
	}
}

func TestJoinUnderUsesAbsTmp(t *testing.T) {
	root := "/www/wwwroot/huohua"
	tmp := "/www/wwwroot/huohua/var/tmp"
	got := JoinUnder(root, tmp, "login-1.json")
	want := filepath.Join(filepath.Clean(tmp), "login-1.json")
	if got != want {
		t.Fatalf("got %s want %s", got, want)
	}
	got = JoinUnder(root, "www/wwwroot/huohua/var/tmp", "sms-x")
	if got != filepath.Join(filepath.Clean("/www/wwwroot/huohua/var/tmp"), "sms-x") {
		t.Fatalf("missing slash: %s", got)
	}
}

func TestLooksLikeAbsMissingSlash(t *testing.T) {
	if !looksLikeAbsMissingSlash("www/wwwroot/huohua") {
		t.Fatal("expected missing-slash abs")
	}
	if looksLikeAbsMissingSlash("var/tmp") || looksLikeAbsMissingSlash("..") {
		t.Fatal("relative should stay relative")
	}
}

func TestNearestDeployRootWalksUp(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "worker-py"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(root, "protocol-node"), 0o755); err != nil {
		t.Fatal(err)
	}
	nested := filepath.Join(root, "www", "wwwroot", "huohua")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatal(err)
	}
	got := nearestDeployRoot(nested)
	if got != filepath.Clean(root) {
		t.Fatalf("got %s want %s", got, root)
	}
}

func TestNormalizeRootCandidate(t *testing.T) {
	got, err := normalizeRootCandidate("www/wwwroot/huohua")
	if err != nil {
		t.Fatal(err)
	}
	if got != filepath.Clean("/www/wwwroot/huohua") {
		t.Fatalf("got %s", got)
	}
	got, err = normalizeRootCandidate("/www/wwwroot/huohua")
	if err != nil {
		t.Fatal(err)
	}
	if got != filepath.Clean("/www/wwwroot/huohua") {
		t.Fatalf("abs: %s", got)
	}
}

func TestResolveSidecars(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "worker-py"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "protocol-node"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "worker-py", "main.py"), []byte("#"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "protocol-node", "index.mjs"), []byte("//"), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("HUOHUA_SIDECAR_PY", "")
	t.Setenv("HUOHUA_SIDECAR_PY_SCRIPT", "")
	t.Setenv("HUOHUA_SIDECAR_NODE", "")
	t.Setenv("HUOHUA_SIDECAR_NODE_SCRIPT", "")
	pyBin, pyScript, nodeBin, nodeScript, err := resolveSidecars(root, []string{root})
	if err != nil {
		t.Fatal(err)
	}
	if nodeBin != "node" {
		t.Fatalf("node %s", nodeBin)
	}
	if pyBin != "" && !fileExists(pyBin) {
		t.Fatalf("pyBin should be existing executable, got %s", pyBin)
	}
	if pyScript != filepath.Join(root, "worker-py", "main.py") {
		t.Fatalf("py script %s", pyScript)
	}
	if nodeScript != filepath.Join(root, "protocol-node", "index.mjs") {
		t.Fatalf("node script %s", nodeScript)
	}
}

func TestResolvePythonPrefersEnv(t *testing.T) {
	root := t.TempDir()
	fake := filepath.Join(root, "custom-py")
	if err := os.WriteFile(fake, []byte(""), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("HUOHUA_SIDECAR_PY", fake)
	if got := resolvePython(root); got != fake {
		t.Fatalf("env: %s", got)
	}
}

func TestResolvePythonPrefersVenv(t *testing.T) {
	root := t.TempDir()
	t.Setenv("HUOHUA_SIDECAR_PY", "")
	venv := filepath.Join(root, "worker-py", ".venv", "bin", "python")
	if err := os.MkdirAll(filepath.Dir(venv), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(venv, []byte(""), 0o755); err != nil {
		t.Fatal(err)
	}
	if got := resolvePython(root); got != venv {
		t.Fatalf("venv: %s", got)
	}
}

func TestResolveSidecarsMissing(t *testing.T) {
	root := t.TempDir()
	_, _, _, _, err := resolveSidecars(root, []string{root})
	if err == nil || !strings.Contains(err.Error(), "Python sidecar") {
		t.Fatalf("want sidecar error, got %v", err)
	}
}

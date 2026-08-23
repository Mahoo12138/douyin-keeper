package sidecar

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestBrowsersPathDefaultAndOverride(t *testing.T) {
	t.Setenv("PLAYWRIGHT_BROWSERS_PATH", "")
	root := t.TempDir()
	if got := browsersPath(root); got != filepath.Join(root, "worker-py", ".ms-playwright") {
		t.Fatalf("default: %s", got)
	}
	want := filepath.Join(root, "custom-browsers")
	t.Setenv("PLAYWRIGHT_BROWSERS_PATH", want)
	if got := browsersPath(root); got != want {
		t.Fatalf("override: %s", got)
	}
}

func TestEnsureBrowsersDirCreatesWritable(t *testing.T) {
	t.Setenv("PLAYWRIGHT_BROWSERS_PATH", "")
	root := t.TempDir()
	p, err := ensureBrowsersDir(root)
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(root, "worker-py", ".ms-playwright")
	if p != want {
		t.Fatalf("got %s want %s", p, want)
	}
	if !isWritableDir(p) {
		t.Fatal("browsers dir not writable")
	}
	if runtime.GOOS != "windows" {
		st, err := os.Stat(p)
		if err != nil {
			t.Fatal(err)
		}
		if st.Mode().Perm()&0o220 == 0 {
			t.Fatalf("want owner/group write, got %o", st.Mode().Perm())
		}
	}
}

func TestSidecarHomeOverridesRoot(t *testing.T) {
	root := t.TempDir()
	t.Setenv("HOME", "/root")
	got := sidecarHome(root)
	if got != filepath.Join(root, "worker-py") {
		t.Fatalf("got %s", got)
	}
}

func TestSidecarHomeKeepsWritable(t *testing.T) {
	root := t.TempDir()
	home := t.TempDir()
	t.Setenv("HOME", home)
	if got := sidecarHome(root); got != "" {
		t.Fatalf("should keep writable HOME, got %s", got)
	}
}

func TestBrowsersPathNoDouble(t *testing.T) {
	root := "/www/wwwroot/huohua"
	t.Setenv("PLAYWRIGHT_BROWSERS_PATH", "www/wwwroot/huohua/worker-py/.ms-playwright")
	got := browsersPath(root)
	if got != filepath.Clean("/www/wwwroot/huohua/worker-py/.ms-playwright") {
		t.Fatalf("got %s", got)
	}
}

func TestApplySidecarEnv(t *testing.T) {
	t.Setenv("HOME", "/root")
	t.Setenv("PLAYWRIGHT_BROWSERS_PATH", "")
	root := t.TempDir()
	env := applySidecarEnv(root, []string{"FOO=1", "HOME=/root"})
	browsers := envVal(env, "PLAYWRIGHT_BROWSERS_PATH")
	if !strings.HasSuffix(filepath.ToSlash(browsers), "/worker-py/.ms-playwright") {
		t.Fatalf("browsers=%s", browsers)
	}
	if envVal(env, "HOME") != filepath.Join(root, "worker-py") {
		t.Fatalf("HOME=%s", envVal(env, "HOME"))
	}
	if envVal(env, "FOO") != "1" {
		t.Fatal("lost extra env")
	}
}

func envVal(env []string, key string) string {
	prefix := key + "="
	for i := len(env) - 1; i >= 0; i-- {
		if strings.HasPrefix(env[i], prefix) {
			return env[i][len(prefix):]
		}
	}
	return ""
}

func TestPutEnvReplaces(t *testing.T) {
	env := putEnv([]string{"A=1", "HOME=/root", "B=2"}, "HOME", "/tmp/x")
	if envVal(env, "HOME") != "/tmp/x" {
		t.Fatalf("%v", env)
	}
	if envVal(env, "A") != "1" || envVal(env, "B") != "2" {
		t.Fatalf("%v", env)
	}
}

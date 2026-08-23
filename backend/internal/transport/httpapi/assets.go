package httpapi

import (
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// spaHandler serves a built SPA with the docs/16 §2.6 cache policy and SPA
// fallback. stripPrefix removes the mount root (e.g. "/admin").
func spaHandler(fileSys fs.FS, index string, stripPrefix string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := r.URL.Path
		if stripPrefix != "" {
			name = strings.TrimPrefix(name, stripPrefix)
		}
		if name == "" {
			name = "/"
		}
		name = path.Clean(name)
		if name == "." || name == "/" {
			name = index
		}
		rel := strings.TrimPrefix(name, "/")

		if _, err := fs.Stat(fileSys, rel); err != nil {
			if strings.HasPrefix(r.URL.Path, "/api/") {
				http.NotFound(w, r)
				return
			}
			// SPA fallback (docs/16 §2.5): never fallback for /api/*.
			rel = strings.TrimPrefix(index, "/")
		}
		if strings.HasPrefix(name, "/assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		http.ServeFileFS(w, r, fileSys, rel)
	}
}
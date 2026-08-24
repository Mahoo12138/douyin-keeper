// Package webassets embeds the single TanStack SPA (user routes plus nested
// /admin routes). The tracked fallback keeps `go build` green on a fresh
// checkout; release builds use the generated output of build:spa.
package webassets

import (
	"embed"
	"io/fs"
)

//go:embed all:dist fallback
var content embed.FS

// Web returns the embedded PC C-end SPA filesystem.
func Web() (fs.FS, error) {
	if web, err := fs.Sub(content, "dist/web"); err == nil {
		if _, statErr := fs.Stat(web, "index.html"); statErr == nil {
			return web, nil
		}
	}
	return fs.Sub(content, "fallback")
}

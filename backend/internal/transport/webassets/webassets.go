// Package webassets embeds the built web/admin SPAs (docs/16 §2.3). The
// Docker release build copies apps/{web,admin}/dist into dist/{web,admin};
// the .gitkeep files keep `go build` green on a fresh checkout.
package webassets

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var content embed.FS

// Web returns the embedded PC C-end SPA filesystem.
func Web() (fs.FS, error) {
	return fs.Sub(content, "dist/web")
}

// Admin returns the embedded admin console SPA filesystem.
func Admin() (fs.FS, error) {
	return fs.Sub(content, "dist/admin")
}
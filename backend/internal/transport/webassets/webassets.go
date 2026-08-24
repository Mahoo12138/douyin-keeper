// Package webassets embeds the single TanStack SPA (user routes plus nested
// /admin routes). The .gitkeep file keeps `go build` green on a fresh checkout.
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

//go:build unix

package main

import (
	"os/signal"
	"syscall"
)

func ignoreJobControlStop() {
	signal.Ignore(syscall.SIGTSTP)
}

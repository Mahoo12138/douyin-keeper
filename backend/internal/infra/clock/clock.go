// Package clock abstracts the local clock so time-sensitive code can be
// tested deterministically.
package clock

import "time"

// Now returns the current time. Tests may reassign it.
var Now = func() time.Time { return time.Now() }

// IsWithin reports whether t falls inside [start, end) in the given tz.
func IsWithin(t time.Time, start, end time.Time) bool {
	return !t.Before(start) && t.Before(end)
}

// StartOfLocalDay returns the day boundary of t in tz.
func StartOfLocalDay(t time.Time, loc *time.Location) time.Time {
	y, m, d := t.In(loc).Date()
	return time.Date(y, m, d, 0, 0, 0, 0, loc)
}
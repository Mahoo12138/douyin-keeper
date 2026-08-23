package password

import (
	"fmt"
	"unicode/utf8"

	"github.com/alexedwards/argon2id"
)

var params = &argon2id.Params{
	Memory:      64 * 1024,
	Iterations:  1,
	Parallelism: 4,
	SaltLength:  16,
	KeyLength:   32,
}

func Hash(plain string) (string, error) {
	if err := Validate(plain); err != nil {
		return "", err
	}
	return argon2id.CreateHash(plain, params)
}

func Verify(plain, hash string) (bool, error) {
	return argon2id.ComparePasswordAndHash(plain, hash)
}

func Validate(plain string) error {
	n := utf8.RuneCountInString(plain)
	if n < 8 || n > 72 {
		return fmt.Errorf("密码长度须为 8–72 个字符")
	}
	return nil
}

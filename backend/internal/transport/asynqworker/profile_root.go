package asynqworker

import "os"

const defaultProfileRoot = "/tmp/douyin-keeper/login"

func prepareProfileRoot(root string) (string, error) {
	if root == "" {
		root = defaultProfileRoot
	}
	if err := os.MkdirAll(root, 0o700); err != nil {
		return "", err
	}
	if err := os.Chmod(root, 0o700); err != nil {
		return "", err
	}
	return root, nil
}

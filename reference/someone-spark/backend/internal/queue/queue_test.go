package queue

import "testing"

func TestWorkerSubscribesLoginQueue(t *testing.T) {
	q := TaskQueue(TypeLoginQR)
	if q != QueueLogin {
		t.Fatalf("login.qr 入队 queue=%s", q)
	}
	if _, ok := WorkerQueues()[q]; !ok {
		t.Fatal("worker 未订阅 login.qr 入队的 queue")
	}
	if _, ok := WorkerQueues()[QueueDefault]; !ok {
		t.Fatal("worker 未订阅 default")
	}
	if _, ok := WorkerQueues()[QueueCritical]; !ok {
		t.Fatal("worker 未订阅 critical")
	}
}

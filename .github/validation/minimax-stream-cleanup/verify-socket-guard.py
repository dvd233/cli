import errno
import socket

try:
    socket.socket()
except OSError as error:
    assert error.errno == errno.EACCES, error
    print('PASS syscall guard: socket creation rejected with EACCES')
else:
    raise RuntimeError('Socket creation unexpectedly allowed')

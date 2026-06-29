// PoC: prove non-root seccomp confinement. Deny openat -> SIGSYS; write allowed.
#include "seccomp_sandbox.hpp"
#include <cstdio>
#include <fcntl.h>
#include <cstring>
int main() {
    // build a tiny filter: deny openat, allow the rest (write/_exit work).
    std::vector<sock_filter> prog = {
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(seccomp_data, nr)),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, SYS_openat, 0, 1),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
    };
    sock_fprog fp{ (unsigned short)prog.size(), prog.data() };
    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) || prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &fp)) { perror("seccomp"); return 2; }
    const char* msg = "write() allowed under seccomp\n"; (void)!write(1, msg, strlen(msg));   // allowed
    int fd = (int)syscall(SYS_openat, AT_FDCWD, "/etc/hostname", O_RDONLY);                    // KILLED here
    printf("openat returned %d (SHOULD NOT PRINT)\n", fd);
    return 0;
}

// ============================================================================
// SDOA isolation — Linux seccomp backend (Phase 6.5).
// Intent-driven syscall confinement, installable WITHOUT root via NO_NEW_PRIVS.
// Default-allow with a deny-list of dangerous syscalls (network/exec/fork/
// ptrace); intents relax specific entries. Production hardening would invert to
// a default-deny allow-list; this PoC proves the mechanism honestly.
// ============================================================================
#pragma once
#include <cstdint>
#include <cstddef>
#include <vector>
#include <string>
#include <unistd.h>
#include <sys/prctl.h>
#include <linux/seccomp.h>
#include <linux/filter.h>
#include <linux/audit.h>
#include <sys/syscall.h>

namespace sdoa_iso {

enum Intent : uint32_t { I_PURE = 0, I_NETWORK = 1u << 0, I_FS_WRITE = 1u << 1, I_UNSAFE = 1u << 2 };

// Returns true on success. With I_UNSAFE no filter is installed (trusted-only).
inline bool install_seccomp(uint32_t intents) {
    if (intents & I_UNSAFE) return true;  // no confinement (must be a trusted, signed module)

    std::vector<long> deny = { SYS_execve, SYS_execveat, SYS_ptrace, SYS_fork, SYS_vfork };
    if (!(intents & I_NETWORK)) { deny.push_back(SYS_socket); deny.push_back(SYS_connect); }
    // (fs:read-write is enforced by the stdlib FileSystem root, not a syscall filter here.)

    std::vector<sock_filter> prog;
    prog.push_back(BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(seccomp_data, nr)));
    for (long nr : deny) {
        prog.push_back(BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, (uint32_t)nr, 0, 1)); // if nr==syscall, fall through to KILL
        prog.push_back(BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS));
    }
    prog.push_back(BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW));

    sock_fprog fprog{ (unsigned short)prog.size(), prog.data() };
    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) return false;
    if (prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &fprog) != 0) return false;
    return true;
}

inline uint32_t intents_from_sandbox(const std::string& mode) {
    if (mode == "unsafe") return I_UNSAFE;
    if (mode == "network") return I_NETWORK;
    if (mode == "fs") return I_FS_WRITE;
    return I_PURE;
}

} // namespace sdoa_iso

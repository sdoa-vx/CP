// ============================================================================
// SDOA CLI signing helpers (Phase 6.4). Real ed25519 via libsodium when built
// with signing enabled. Define SDOA_NO_SIGNING to build with NO external deps
// (key/sign/verify become no-ops; used by the dependency-free Windows build).
// ============================================================================
#pragma once
#include "pkg.hpp"   // base64 helpers
#include <string>

namespace sdoa_sign {

#ifdef SDOA_NO_SIGNING

inline bool available() { return false; }
inline bool keypair(std::string&, std::string&) { return false; }
inline std::string sign(const std::string&, const std::string&) { return ""; }
inline bool verify(const std::string&, const std::string&, const std::string&) { return false; }

#else

extern "C" {
    int sodium_init(void);
    int crypto_sign_ed25519_keypair(unsigned char* pk, unsigned char* sk);
    int crypto_sign_ed25519_detached(unsigned char* sig, unsigned long long* siglen,
                                     const unsigned char* m, unsigned long long mlen, const unsigned char* sk);
    int crypto_sign_ed25519_verify_detached(const unsigned char* sig, const unsigned char* m,
                                            unsigned long long mlen, const unsigned char* pk);
}

inline bool available() { return true; }
inline bool init() { static bool ok = (sodium_init() >= 0); return ok; }

inline bool keypair(std::string& pub_b64, std::string& sk_b64) {
    if (!init()) return false;
    unsigned char pk[32], sk[64];
    if (crypto_sign_ed25519_keypair(pk, sk) != 0) return false;
    pub_b64 = sdoa_pkg::b64enc(std::string(reinterpret_cast<char*>(pk), 32));
    sk_b64  = sdoa_pkg::b64enc(std::string(reinterpret_cast<char*>(sk), 64));
    return true;
}
inline std::string sign(const std::string& msg, const std::string& sk_b64) {
    if (!init()) return "";
    std::string sk = sdoa_pkg::b64dec(sk_b64);
    if (sk.size() != 64) return "";
    unsigned char sig[64]; unsigned long long sl = 0;
    if (crypto_sign_ed25519_detached(sig, &sl, reinterpret_cast<const unsigned char*>(msg.data()), msg.size(),
                                     reinterpret_cast<const unsigned char*>(sk.data())) != 0) return "";
    return sdoa_pkg::b64enc(std::string(reinterpret_cast<char*>(sig), 64));
}
inline bool verify(const std::string& msg, const std::string& sig_b64, const std::string& pub_b64) {
    if (!init()) return false;
    std::string sig = sdoa_pkg::b64dec(sig_b64), pk = sdoa_pkg::b64dec(pub_b64);
    if (sig.size() != 64 || pk.size() != 32) return false;
    return crypto_sign_ed25519_verify_detached(reinterpret_cast<const unsigned char*>(sig.data()),
                                               reinterpret_cast<const unsigned char*>(msg.data()), msg.size(),
                                               reinterpret_cast<const unsigned char*>(pk.data())) == 0;
}

#endif

} // namespace sdoa_sign

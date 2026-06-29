// ============================================================================
// SDOA CLI packaging helpers: SHA-256, base64, and the deterministic .sdoa
// package format. Dependency-free (no openssl / no external archiver).
// ============================================================================
#pragma once
#include <nlohmann/json.hpp>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>
#include <algorithm>
#include <cstdio>
#include <cstdint>

namespace sdoa_pkg {
using nlohmann::json;
namespace fs = std::filesystem;

// ---- SHA-256 (compact, public-domain style) ----
inline std::string sha256_hex(const std::string& data) {
    auto rotr = [](uint32_t x, int n) { return (x >> n) | (x << (32 - n)); };
    static const uint32_t K[64] = {
        0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
        0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
        0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
        0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
        0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
        0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
        0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
        0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2};
    uint32_t h[8] = {0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19};
    std::string msg = data;
    uint64_t ml = (uint64_t)data.size() * 8;
    msg += (char)0x80;
    while (msg.size() % 64 != 56) msg += (char)0x00;
    for (int i = 7; i >= 0; --i) msg += (char)((ml >> (i * 8)) & 0xff);
    for (size_t off = 0; off < msg.size(); off += 64) {
        uint32_t w[64];
        for (int i = 0; i < 16; i++)
            w[i] = ((uint32_t)(unsigned char)msg[off+i*4] << 24) | ((uint32_t)(unsigned char)msg[off+i*4+1] << 16)
                 | ((uint32_t)(unsigned char)msg[off+i*4+2] << 8) | ((uint32_t)(unsigned char)msg[off+i*4+3]);
        for (int i = 16; i < 64; i++) {
            uint32_t s0 = rotr(w[i-15],7) ^ rotr(w[i-15],18) ^ (w[i-15] >> 3);
            uint32_t s1 = rotr(w[i-2],17) ^ rotr(w[i-2],19) ^ (w[i-2] >> 10);
            w[i] = w[i-16] + s0 + w[i-7] + s1;
        }
        uint32_t a=h[0],b=h[1],c=h[2],d=h[3],e=h[4],f=h[5],g=h[6],hh=h[7];
        for (int i = 0; i < 64; i++) {
            uint32_t S1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
            uint32_t ch = (e & f) ^ ((~e) & g);
            uint32_t t1 = hh + S1 + ch + K[i] + w[i];
            uint32_t S0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
            uint32_t maj = (a & b) ^ (a & c) ^ (b & c);
            uint32_t t2 = S0 + maj;
            hh=g; g=f; f=e; e=d+t1; d=c; c=b; b=a; a=t1+t2;
        }
        h[0]+=a; h[1]+=b; h[2]+=c; h[3]+=d; h[4]+=e; h[5]+=f; h[6]+=g; h[7]+=hh;
    }
    char out[65];
    for (int i = 0; i < 8; i++) std::snprintf(out + i*8, 9, "%08x", h[i]);
    return std::string(out, 64);
}

// ---- base64 ----
inline std::string b64enc(const std::string& in) {
    static const char* t = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string o; int val = 0, bits = -6;
    for (unsigned char c : in) { val = (val << 8) + c; bits += 8; while (bits >= 0) { o += t[(val >> bits) & 0x3f]; bits -= 6; } }
    if (bits > -6) o += t[((val << 8) >> (bits + 8)) & 0x3f];
    while (o.size() % 4) o += '=';
    return o;
}
inline std::string b64dec(const std::string& in) {
    int T[256]; for (int i = 0; i < 256; i++) T[i] = -1;
    const char* t = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    for (int i = 0; i < 64; i++) T[(unsigned char)t[i]] = i;
    std::string o; int val = 0, bits = -8;
    for (unsigned char c : in) { if (T[c] == -1) continue; val = (val << 6) + T[c]; bits += 6; if (bits >= 0) { o += char((val >> bits) & 0xff); bits -= 8; } }
    return o;
}

// ---- package files ----
struct PFile { std::string path; std::string bytes; bool binary; };

inline bool read_bytes(const fs::path& p, std::string& out) {
    std::ifstream f(p, std::ios::binary); if (!f) return false;
    std::ostringstream ss; ss << f.rdbuf(); out = ss.str(); return true;
}

// Gather a module's files (sorted). Binary if under lib/.
inline std::vector<PFile> collect(const fs::path& dir, std::string& err) {
    std::vector<PFile> files;
    std::string s;
    if (!read_bytes(dir / "module.json", s)) { err = "module.json not found"; return files; }
    files.push_back({"module.json", s, false});
    if (fs::is_directory(dir / "capabilities"))
        for (auto& e : fs::directory_iterator(dir / "capabilities"))
            if (e.is_regular_file() && e.path().extension() == ".json") {
                std::string c; read_bytes(e.path(), c);
                files.push_back({"capabilities/" + e.path().filename().string(), c, false});
            }
    // entry library
    try {
        json m = json::parse(s);
        std::string entry = m.value("entry", "");
        if (!entry.empty()) { std::string c; if (read_bytes(dir / entry, c)) files.push_back({entry, c, true}); }
    } catch (...) {}
    for (const char* opt : {"README.md", "LICENSE"}) {
        std::string c; if (read_bytes(dir / opt, c)) files.push_back({opt, c, false});
    }
    std::sort(files.begin(), files.end(), [](const PFile& a, const PFile& b){ return a.path < b.path; });
    return files;
}

// nlohmann::json orders object keys lexicographically => deterministic dump().
inline json files_to_obj(const std::vector<PFile>& files) {
    json o = json::object();
    for (const auto& f : files) {
        if (f.binary) o[f.path] = json{{"encoding", "base64"}, {"data", b64enc(f.bytes)}};
        else          o[f.path] = f.bytes;  // utf8 text stored verbatim
    }
    return o;
}

// Digest is sha256 of the canonicalized {sdoa_version, module, files} (no digest field).
inline std::string canonical_digest(const json& core) { return sha256_hex(core.dump()); }

// Build a .sdoa package matching the canonical structure.
inline json build_package(const json& module_json, const std::vector<PFile>& files) {
    json core;
    core["sdoa_version"] = 1;
    core["module"] = module_json;
    core["files"] = files_to_obj(files);
    json pkg = core;
    pkg["digest"] = {{"algorithm", "sha256"}, {"value", canonical_digest(core)}};
    return pkg;
}

// Recompute and compare the digest. `computed` is set to the recomputed value.
inline bool verify(const json& pkg, std::string& computed) {
    json core;
    core["sdoa_version"] = pkg.value("sdoa_version", 0);
    if (!pkg.contains("module") || !pkg.contains("files")) { computed.clear(); return false; }
    core["module"] = pkg.at("module");
    core["files"] = pkg.at("files");
    computed = canonical_digest(core);
    return pkg.contains("digest") && pkg["digest"].value("value", std::string()) == computed;
}

// Decode a package's files back to raw bytes.
inline std::vector<PFile> unpack(const json& pkg) {
    std::vector<PFile> files;
    for (auto& [path, val] : pkg.at("files").items()) {
        if (val.is_string()) files.push_back({path, val.get<std::string>(), false});
        else files.push_back({path, b64dec(val.value("data", std::string())), true});
    }
    return files;
}

} // namespace sdoa_pkg

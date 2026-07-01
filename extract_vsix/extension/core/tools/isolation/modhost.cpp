// ============================================================================
// SDOA module host (Phase 6.5 PoC). Runs ONE module's capabilities in its own
// OS process under a seccomp sandbox, serving the engine over a length-prefixed
// JSON IPC channel on stdin/stdout. Demonstrates Layers 1 (process), 2 (seccomp),
// 3 (intent gating), 4 (IPC). Engine-path integration is staged (see Isolation.md).
//
//   modhost --modules <dir> [--sandbox pure|network|fs|unsafe]
//
// Wire protocol (both directions): u32 little-endian length, then that many
// UTF-8 JSON bytes. Request: {"module","capability","input"}. Response:
// {"ok":true,"output":{...}} or {"ok":false,"error":"..."}.
// ============================================================================
#include "sdoa.h"
#include "seccomp_sandbox.hpp"
#include <nlohmann/json.hpp>
#include <unistd.h>
#include <string>
#include <vector>
#include <cstring>
#include <cstdint>
#include <map>
#include <sys/socket.h>
#include <netinet/in.h>
using json = nlohmann::json;

static int g_in = 0, g_out = 1;
static bool read_n(int fd, void* buf, size_t n) {
    char* p = (char*)buf; size_t got = 0;
    while (got < n) { ssize_t r = read(fd, p + got, n - got); if (r <= 0) return false; got += (size_t)r; }
    return true;
}
static bool read_frame(std::string& out) {
    uint32_t len; if (!read_n(g_in, &len, 4)) return false;
    out.resize(len); return len == 0 ? true : read_n(g_in, out.data(), len);
}
static void write_frame(const std::string& s) {
    uint32_t len = (uint32_t)s.size(); (void)!write(g_out, &len, 4); (void)!write(g_out, s.data(), len);
}
static std::string opt(int c, char** v, const std::string& k, const std::string& d) {
    for (int i = 0; i < c - 1; ++i) if (k == v[i]) return v[i + 1]; return d;
}
static std::string buf_call(SDOA_Status(*fn)(SDOA_EngineHandle,char*,size_t,size_t*), SDOA_EngineHandle e) {
    size_t need = 0; fn(e, nullptr, 0, &need); std::vector<char> b(need); fn(e, b.data(), b.size(), &need); return std::string(b.data());
}

int main(int argc, char** argv) {
    std::string mods = opt(argc, argv, "--modules", "modules");
    std::string sandbox = opt(argc, argv, "--sandbox", "pure");
    SDOA_Config cfg{1, SDOA_FLAG_INLINE, 1};   // inline => no worker threads in the host
    SDOA_EngineHandle e = nullptr;
    if (sdoa_engine_create(&cfg, &e) != SDOA_OK) return 2;
    if (sdoa_engine_load_modules(e, mods.c_str()) != SDOA_OK) return 3;

    // Build a model declaring every loaded (foreign) capability so pipelines validate.
    json man = json::parse(buf_call(sdoa_engine_capabilities_json, e));
    std::map<std::string, std::vector<std::string>> bymod;
    for (auto& c : man) if (c.value("origin", "") == "foreign") bymod[c["module"].get<std::string>()].push_back(c["capability"].get<std::string>());
    json domains = json::array();
    for (auto& [m, caps] : bymod) {
        json carr = json::array(); for (auto& c : caps) carr.push_back({{"name", c}});
        domains.push_back({{"id", m}, {"modules", json::array({ json{{"id", m}, {"capabilities", carr}, {"dependencies", json::array()}, {"invariants", json::array()}} })}});
    }
    json model = {{"domains", domains}};
    sdoa_engine_load_model_from_json(e, model.dump().c_str(), model.dump().size());

    // 6.6: remote transport. Establish the TCP connection BEFORE sandboxing so the
    // host can serve, while the pure seccomp filter still blocks the MODULE from
    // opening new sockets. Same length-prefixed JSON protocol as stdio.
    std::string listen_port = opt(argc, argv, "--listen", "");
    if (!listen_port.empty()) {
        int ls = socket(AF_INET, SOCK_STREAM, 0);
        int yes = 1; setsockopt(ls, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));
        sockaddr_in addr{}; addr.sin_family = AF_INET; addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
        addr.sin_port = htons((uint16_t)std::stoi(listen_port));
        if (bind(ls, (sockaddr*)&addr, sizeof(addr)) != 0) return 5;
        if (::listen(ls, 1) != 0) return 6;
        int conn = accept(ls, nullptr, nullptr);   // one client per module-version process
        if (conn < 0) return 7;
        g_in = g_out = conn;   // serve loop now speaks over the socket
    }

    // Drop into the sandbox AFTER all loading/dlopen is done.
    if (!sdoa_iso::install_seccomp(sdoa_iso::intents_from_sandbox(sandbox))) return 4;

    std::string req;
    while (read_frame(req)) {
        json resp;
        try {
            json r = json::parse(req);
            std::string mod = r.value("module", ""), cap = r.value("capability", "");
            json input = r.value("input", json::object());
            json pipe = {{"pipelines", json::array({ json{{"id","__call"},
                {"steps", json::array({ json{{"id","S"},{"module_id",mod},{"capability",cap},{"input",input}} })},
                {"edges", json::array()}} })}};
            std::string ps = pipe.dump();
            if (sdoa_engine_load_pipelines_from_json(e, ps.c_str(), ps.size()) != SDOA_OK) throw std::runtime_error("pipeline load failed");
            SDOA_ResultHandle rh = nullptr;
            if (sdoa_engine_run_pipeline(e, "__call", "{}", 2, &rh) != SDOA_OK || !rh) throw std::runtime_error("run failed");
            size_t need = 0; sdoa_result_to_json(rh, nullptr, 0, &need);
            std::vector<char> rb(need); sdoa_result_to_json(rh, rb.data(), rb.size(), &need);
            json out = json::parse(std::string(rb.data()));
            sdoa_result_destroy(rh);
            if (out.value("success", false)) resp = {{"ok", true}, {"output", out["outputs"]["S"]}};
            else resp = {{"ok", false}, {"error", out.value("error", "error")}};
        } catch (const std::exception& ex) { resp = {{"ok", false}, {"error", std::string("host: ") + ex.what()}}; }
        write_frame(resp.dump());
    }
    sdoa_engine_destroy(e);
    return 0;
}

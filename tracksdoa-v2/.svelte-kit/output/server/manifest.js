export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "dashboard/_app",
	assets: new Set(["favicon.png"]),
	mimeTypes: {".png":"image/png"},
	_: {
		client: {start:"_app/immutable/entry/start.DqL8hn2h.js",app:"_app/immutable/entry/app.ClTuzQKb.js",imports:["_app/immutable/entry/start.DqL8hn2h.js","_app/immutable/chunks/D6WioeVc.js","_app/immutable/chunks/iK-8glcY.js","_app/immutable/chunks/B4HuleqO.js","_app/immutable/chunks/BFLY9nVk.js","_app/immutable/entry/app.ClTuzQKb.js","_app/immutable/chunks/iK-8glcY.js","_app/immutable/chunks/Bppi3VGp.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js'))
		],
		remotes: {
			
		},
		routes: [
			
		],
		prerendered_routes: new Set(["/dashboard/","/dashboard/drift","/dashboard/governance","/dashboard/lineage","/dashboard/mesh","/dashboard/proposals","/dashboard/routing","/dashboard/scan","/dashboard/time-machine","/dashboard/timeline"]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();

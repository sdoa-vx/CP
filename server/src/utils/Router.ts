import { IncomingMessage, ServerResponse } from "http";

export type Handler = (req: IncomingMessage, res: ServerResponse, next?: () => void) => any;

export class Router {
  private routes: { method?: string; path: string; handler: Handler; isUse: boolean }[] = [];

  public get(path: string, handler: Handler) {
    this.routes.push({ method: "GET", path, handler, isUse: false });
  }

  public post(path: string, handler: Handler) {
    this.routes.push({ method: "POST", path, handler, isUse: false });
  }

  public use(pathOrHandler: string | Handler | Router, handlerOrRouter?: Handler | Router) {
    let path = "/";
    let target: any = pathOrHandler;
    if (typeof pathOrHandler === "string") {
      path = pathOrHandler;
      target = handlerOrRouter;
    }

    if (target instanceof Router) {
      this.routes.push({ path, handler: (req, res, next) => target.handle(req, res, next), isUse: true });
    } else {
      this.routes.push({ path, handler: target, isUse: true });
    }
  }

  public handle(req: IncomingMessage, res: ServerResponse, finalNext?: () => void) {
    const url = req.url || "/";
    const method = req.method;

    let idx = 0;
    const next = () => {
      if (idx >= this.routes.length) {
        if (finalNext) return finalNext();
        res.statusCode = 404;
        return res.end("Not Found");
      }

      const route = this.routes[idx++];
      
      const isMethodMatch = !route.method || route.method === method;
      
      let isPathMatch = false;
      let matchedPrefix = "";

      if (route.isUse) {
        isPathMatch = url.startsWith(route.path);
        matchedPrefix = route.path === "/" ? "" : route.path;
      } else {
        isPathMatch = url === route.path || (route.path.includes(":") && this.matchDynamic(route.path, url));
      }

      if (isMethodMatch && isPathMatch) {
        // Strip prefix for mounted routers if needed (mocked for simplicity)
        const oldUrl = req.url;
        if (route.isUse && matchedPrefix) {
          req.url = url.slice(matchedPrefix.length) || "/";
        }
        
        try {
          route.handler(req, res, () => {
            req.url = oldUrl; // restore
            next();
          });
        } catch (err) {
          console.error("Router error:", err);
          res.statusCode = 500;
          res.end("Internal Error");
        }
      } else {
        next();
      }
    };

    next();
  }

  private matchDynamic(routePath: string, url: string): boolean {
    // Simple naive matching for /path/:id
    const rParts = routePath.split("/");
    const uParts = url.split("/");
    if (rParts.length !== uParts.length) return false;
    for (let i = 0; i < rParts.length; i++) {
      if (rParts[i].startsWith(":")) continue;
      if (rParts[i] !== uParts[i]) return false;
    }
    return true;
  }
}

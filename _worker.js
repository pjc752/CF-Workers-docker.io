// _worker.js

// Docker镜像仓库主机地址
let hub_host = 'registry-1.docker.io';
// Docker认证服务器地址
const auth_url = 'https://auth.docker.io';

let 屏蔽爬虫UA = ['netcraft'];

// 根据主机名选择对应的上游地址
function routeByHosts(host) {
  const routes = {
    "quay": "quay.io",
    "gcr": "gcr.io",
    "k8s-gcr": "k8s.gcr.io",
    "k8s": "registry.k8s.io",
    "ghcr": "ghcr.io",
    "cloudsmith": "docker.cloudsmith.io",
    "nvcr": "nvcr.io",
    "test": "registry-1.docker.io",
  };
  if (host in routes) return [routes[host], false];
  else return [hub_host, true];
}

const PREFLIGHT_INIT = {
  headers: new Headers({
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,TRACE,DELETE,HEAD,OPTIONS',
    'access-control-max-age': '1728000',
  }),
}

function makeRes(body, status = 200, headers = {}) {
  headers['access-control-allow-origin'] = '*'
  return new Response(body, { status, headers })
}

function newUrl(urlStr, base) {
  try {
    return new URL(urlStr, base);
  } catch (err) {
    return null
  }
}

async function nginx() {
  return `<!DOCTYPE html><html><head><title>Welcome to nginx!</title><style>body { width: 35em; margin: 0 auto; font-family: Tahoma, Verdana, Arial, sans-serif; }</style></head><body><h1>Welcome to nginx!</h1><p>If you see this page, the nginx web server is successfully installed and working.</p></body></html>`;
}

// 搜索界面 HTML 保持不变 (为了节省篇幅，此处省略，请保留你原代码中的 searchInterface 函数内容)
async function searchInterface() {
  // ... 这里放你原来那一大段漂亮的 HTML ...
  return `你的原始 HTML 代码`; 
}

export default {
  async fetch(request, env, ctx) {
    const getReqHeader = (key) => request.headers.get(key);
    let url = new URL(request.url);
    const userAgentHeader = request.headers.get('User-Agent');
    const userAgent = userAgentHeader ? userAgentHeader.toLowerCase() : "null";
    
    // 修复 ADD 函数可能的异步问题
    if (env.UA) {
      const newUA = await ADD(env.UA);
      屏蔽爬虫UA = 屏蔽爬虫UA.concat(newUA);
    }
    
    const workers_url = `https://${url.hostname}`;
    const ns = url.searchParams.get('ns');
    const hostname = url.searchParams.get('hubhost') || url.hostname;
    const hostTop = hostname.split('.')[0];

    let checkHost;
    if (ns) {
      hub_host = ns === 'docker.io' ? 'registry-1.docker.io' : ns;
    } else {
      checkHost = routeByHosts(hostTop);
      hub_host = checkHost[0];
    }

    const fakePage = checkHost ? checkHost[1] : false;
    url.hostname = hub_host;
    const hubParams = ['/v1/search', '/v1/repositories'];

    // 路由逻辑处理
    if (屏蔽爬虫UA.some(fxxk => userAgent.includes(fxxk)) && 屏蔽爬虫UA.length > 0) {
      return new Response(await nginx(), { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
    } 
    
    if ((userAgent && userAgent.includes('mozilla')) || hubParams.some(param => url.pathname.includes(param))) {
      if (url.pathname == '/') {
        if (env.URL302) return Response.redirect(env.URL302, 302);
        if (env.URL) {
          if (env.URL.toLowerCase() == 'nginx') return new Response(await nginx(), { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
          return fetch(new Request(env.URL, request));
        }
        if (fakePage) return new Response(await searchInterface(), { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
        // 兜底返回，防止 Promise 为空
        return new Response(await nginx(), { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
      } else {
        if (url.pathname.startsWith('/v1/')) url.hostname = 'index.docker.io';
        else if (fakePage) url.hostname = 'hub.docker.com';
        
        if (url.searchParams.get('q')?.includes('library/') && url.searchParams.get('q') != 'library/') {
          url.searchParams.set('q', url.searchParams.get('q').replace('library/', ''));
        }
        return fetch(new Request(url, request));
      }
    }

    // 处理 Docker 客户端请求
    if (!/%2F/.test(url.search) && /%3A/.test(url.toString())) {
      url = new URL(url.toString().replace(/%3A(?=.*?&)/, '%3Alibrary%2F'));
    }

    if (url.pathname.includes('/token')) {
      let token_url = auth_url + url.pathname + url.search;
      return fetch(new Request(token_url, {
        headers: {
          'Host': 'auth.docker.io',
          'User-Agent': getReqHeader("User-Agent"),
          'Accept': getReqHeader("Accept"),
          'Connection': 'keep-alive'
        }
      }));
    }

    // 特殊处理 /v2/ 认证流
    if (url.pathname.startsWith('/v2/') && (url.pathname.includes('/manifests/') || url.pathname.includes('/blobs/') || url.pathname.includes('/tags/'))) {
      let repo = url.pathname.match(/^\/v2\/(.+?)(?:\/(manifests|blobs|tags)\/)/)?.[1];
      if (repo) {
        const tokenRes = await fetch(`${auth_url}/token?service=registry.docker.io&scope=repository:${repo}:pull`, {
          headers: { 'User-Agent': getReqHeader("User-Agent") }
        });
        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          const token = tokenData.token;
          let newHeader = new Headers(request.headers);
          newHeader.set('Authorization', `Bearer ${token}`);
          newHeader.set('Host', hub_host);
          return fetch(new Request(url, { headers: newHeader }));
        }
      }
    }

    // 最终兜底请求
    let finalHeader = new Headers(request.headers);
    finalHeader.set('Host', hub_host);
    return fetch(new Request(url, { method: request.method, headers: finalHeader }));
  }
};

async function httpHandler(req, pathname, baseHost) {
  // ... 保持你原来的 httpHandler 不变 ...
}

async function proxy(urlObj, reqInit, rawLen) {
  // ... 保持你原来的 proxy 不?变 ...
}

async function ADD(envadd) {
  if (!envadd) return [];
  return envadd.replace(/[ |"'\r\n]+/g, ',').replace(/,+/g, ',').split(',').filter(i => i);
}

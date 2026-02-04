// Docker镜像仓库主机地址
let hub_host = 'registry-1.docker.io';
// Docker认证服务器地址
const auth_url = 'https://auth.docker.io';

let 屏蔽爬虫UA = ['netcraft'];

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

// 保持你原有的 nginx() 和 searchInterface() 函数内容不变...
async function nginx() { /* ...同你之前的代码... */ }
async function searchInterface() { /* ...同你之前的代码... */ }

export default {
    async fetch(request, env, ctx) {
        const getReqHeader = (key) => request.headers.get(key);
        let url = new URL(request.url);
        const userAgentHeader = request.headers.get('User-Agent');
        const userAgent = userAgentHeader ? userAgentHeader.toLowerCase() : "null";
        const workers_url = `https://${url.hostname}`;

        const ns = url.searchParams.get('ns');
        const hostname = url.searchParams.get('hubhost') || url.hostname;
        const hostTop = hostname.split('.')[0];

        let checkHost = routeByHosts(hostTop);
        hub_host = ns ? (ns === 'docker.io' ? 'registry-1.docker.io' : ns) : checkHost[0];
        const fakePage = checkHost ? checkHost[1] : false;

        url.hostname = hub_host;

        // 1. 处理首页和搜索过滤
        if (url.pathname == '/') {
            if (userAgent && userAgent.includes('mozilla')) {
                return new Response(await searchInterface(), { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
            }
            return new Response(await nginx(), { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
        }

        // 2. 处理 Token 请求
        if (url.pathname.includes('/token')) {
            let token_url = auth_url + url.pathname + url.search;
            return fetch(new Request(token_url, request), {
                headers: { 'Host': 'auth.docker.io', 'User-Agent': getReqHeader("User-Agent") }
            });
        }

        // 3. 核心修改：优化 V2 请求及 Auth 逻辑
        if (url.pathname.startsWith('/v2/')) {
            // 补全 library 路径
            if (hub_host == 'registry-1.docker.io' && 
                /^\/v2\/[^/]+\/[^/]+\/[^/]+$/.test(url.pathname) && 
                !/^\/v2\/library/.test(url.pathname)) {
                url.pathname = '/v2/library/' + url.pathname.split('/v2/')[1];
            }

            // 获取令牌逻辑
            const v2Match = url.pathname.match(/^\/v2\/(.+?)(?:\/(manifests|blobs|tags)\/)/);
            if (v2Match) {
                const repo = v2Match[1];
                const tokenUrl = `${auth_url}/token?service=registry.docker.io&scope=repository:${repo}:pull`;
                const tokenRes = await fetch(tokenUrl, { headers: { 'User-Agent': getReqHeader("User-Agent") } });
                
                if (tokenRes.ok) {
                    const tokenData = await tokenRes.json();
                    const token = tokenData.token;
                    
                    let newHeaders = new Headers(request.headers);
                    newHeaders.set('Host', hub_host);
                    newHeaders.set('Authorization', `Bearer ${token}`);

                    const modifiedRequest = new Request(url, {
                        method: request.method,
                        headers: newHeaders,
                        body: request.body,
                        redirect: 'follow'
                    });

                    let resp = await fetch(modifiedRequest);
                    let newRespHeaders = new Headers(resp.headers);
                    newRespHeaders.set('access-control-allow-origin', '*');
                    
                    // 处理重定向 (S3镜像)
                    if (newRespHeaders.get("Location")) {
                        return httpHandler(request, newRespHeaders.get("Location"), hub_host);
                    }

                    return new Response(resp.body, { status: resp.status, headers: newRespHeaders });
                }
            }
        }

        // 通用代理逻辑
        return httpHandler(request, url.pathname + url.search, hub_host);
    }
};

// 保持你原有的 httpHandler, proxy, ADD 函数内容不变...
async function httpHandler(req, pathname, baseHost) { /* ...同你之前的代码... */ }
async function proxy(urlObj, reqInit, rawLen) { /* ...同你之前的代码... */ }
async function ADD(envadd) { /* ...同你之前的代码... */ }

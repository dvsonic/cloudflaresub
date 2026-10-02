import assert from 'node:assert/strict';
import {
  decryptPayload,
  encryptPayload,
  expandNodes,
  parseNodeLinks,
  parsePreferredEndpoints,
  renderClashSubscription,
  renderRawSubscription,
  renderSingBoxSubscription,
  renderSurgeSubscription,
} from '../src/core.js';

const vmess = 'vmess://ewogICJ2IjogIjIiLAogICJwcyI6ICJkZW1vLXdzLXRscyIsCiAgImFkZCI6ICJlZGdlLmV4YW1wbGUuY29tIiwKICAicG9ydCI6ICI0NDMiLAogICJpZCI6ICIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLAogICJzY3kiOiAiYXV0byIsCiAgIm5ldCI6ICJ3cyIsCiAgInRscyI6ICJ0bHMiLAogICJwYXRoIjogIi93cyIsCiAgImhvc3QiOiAiZWRnZS5leGFtcGxlLmNvbSIsCiAgInNuaSI6ICJlZGdlLmV4YW1wbGUuY29tIiwKICAiZnAiOiAiY2hyb21lIiwKICAiYWxwbiI6ICJoMixodHRwLzEuMSIKfQ==';
const vless = 'vless://00000000-0000-4000-8000-000000000002@edge.example.com:8443?type=ws&security=tls&host=edge.example.com&sni=edge.example.com&path=%2Fws#demo-vless';

const { nodes } = parseNodeLinks(vmess);
const { nodes: vlessNodes } = parseNodeLinks(vless);
assert.equal(nodes.length, 1);
assert.equal(nodes[0].type, 'vmess');
assert.equal(nodes[0].server, 'edge.example.com');
assert.equal(vlessNodes[0].type, 'vless');
assert.equal(vlessNodes[0].port, 8443);

const { endpoints } = parsePreferredEndpoints('104.16.1.2#HK\n104.17.2.3:2053#US');
assert.equal(endpoints.length, 2);

const expanded = expandNodes(nodes, endpoints, { keepOriginalHost: true, namePrefix: 'CF' });
assert.equal(expanded.nodes.length, 2);
assert.equal(expanded.nodes[0].server, '104.16.1.2');
assert.equal(expanded.nodes[0].hostHeader, 'edge.example.com');
assert.equal(expanded.nodes[1].port, 2053);

const cloudflareProtocols = expandNodes([...nodes, ...vlessNodes], endpoints.slice(0, 1), {
  cdnProvider: 'cloudflare',
  keepOriginalHost: true,
});
assert.equal(cloudflareProtocols.nodes[0].port, 443);
assert.equal(cloudflareProtocols.nodes[1].port, 8443);
assert.equal(cloudflareProtocols.nodes[1].hostHeader, 'edge.example.com');

const backendVmess = structuredClone(nodes[0]);
const backendVless = structuredClone(vlessNodes[0]);
backendVmess.port = 10001;
backendVless.port = 10002;
backendVmess.tls = false;
backendVless.tls = false;
backendVmess.security = '';
backendVless.security = '';
const cloudflareBackendPorts = expandNodes([backendVmess, backendVless], endpoints.slice(0, 1), {
  cdnProvider: 'cloudflare',
  keepOriginalHost: true,
});
assert.equal(cloudflareBackendPorts.nodes[0].port, 443);
assert.equal(cloudflareBackendPorts.nodes[0].tls, true);
assert.equal(cloudflareBackendPorts.nodes[1].port, 8443);
assert.equal(cloudflareBackendPorts.nodes[1].tls, true);

const cloudfront = expandNodes(nodes, endpoints.slice(0, 1), {
  cdnProvider: 'cloudfront',
  cloudfrontHost: 'd2sncbn3whbq65.cloudfront.net',
  namePrefix: 'AWS',
});
assert.equal(cloudfront.nodes[0].server, '104.16.1.2');
assert.equal(cloudfront.nodes[0].port, 443);
assert.equal(cloudfront.nodes[0].hostHeader, 'd2sncbn3whbq65.cloudfront.net');
assert.equal(cloudfront.nodes[0].sni, 'd2sncbn3whbq65.cloudfront.net');
assert.deepEqual(cloudfront.nodes[0].alpn, ['http/1.1']);

const tunneled = expandNodes([...nodes, ...vlessNodes], endpoints.slice(0, 1), {
  cdnProvider: 'argo',
  argoVmessHost: 'argooci.iconliu.dpdns.org',
  argoVlessHost: 'argovless.iconliu.dpdns.org',
});
assert.equal(tunneled.nodes[0].port, 443);
assert.equal(tunneled.nodes[0].hostHeader, 'argooci.iconliu.dpdns.org');
assert.equal(tunneled.nodes[0].sni, 'argooci.iconliu.dpdns.org');
assert.equal(tunneled.nodes[1].port, 443);
assert.equal(tunneled.nodes[1].hostHeader, 'argovless.iconliu.dpdns.org');
assert.equal(tunneled.nodes[1].sni, 'argovless.iconliu.dpdns.org');

const raw = renderRawSubscription(expanded.nodes);
assert.ok(raw.length > 10);

const clash = renderClashSubscription(expanded.nodes);
assert.match(clash, /proxies:/);
assert.match(clash, /edge\.example\.com/);

const surge = renderSurgeSubscription(expanded.nodes, 'https://sub.example.com/sub/demo?target=surge');
assert.match(surge, /\[Proxy]/);
assert.match(surge, /vmess/);

const singbox = JSON.parse(renderSingBoxSubscription(expanded.nodes));
assert.equal(singbox.inbounds[0].type, 'tun');
assert.equal(singbox.inbounds[0].auto_route, true);
assert.equal(singbox.outbounds[0].type, 'selector');
assert.ok(singbox.outbounds.some((outbound) => outbound.type === 'vmess'));
assert.equal(singbox.dns.servers[0].type, 'https');
assert.equal(singbox.dns.servers[0].server, '1.1.1.1');
assert.equal(singbox.dns.servers[0].address, undefined);
assert.ok(singbox.dns.servers[0].detour);
assert.equal(singbox.dns.servers[1].type, 'local');
assert.equal(singbox.route.auto_detect_interface, true);
assert.equal(singbox.route.default_domain_resolver, 'dns-local');
assert.ok(singbox.route.rule_set.some((ruleSet) => ruleSet.tag === 'geosite-cn'));
assert.ok(singbox.route.rule_set.some((ruleSet) => ruleSet.tag === 'geoip-cn'));
assert.ok(singbox.route.rules.some((rule) => rule.domain_suffix?.includes('.cn') && rule.outbound === 'direct'));
assert.ok(singbox.route.rules.some((rule) => rule.rule_set?.includes('geosite-cn') && rule.outbound === 'direct'));
assert.equal(singbox.experimental.cache_file.enabled, true);

const secret = 'this-is-a-very-secret-key';
const token = await encryptPayload({ nodes: expanded.nodes }, secret);
const payload = await decryptPayload(token, secret);
assert.equal(payload.nodes.length, 2);

console.log('smoke test passed');

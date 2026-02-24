import base64
import ipaddress
import socket
from urllib.parse import urlparse

import requests


def is_safe_external_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ('http', 'https'):
            return False
        host = parsed.hostname
        if not host:
            return False
        if host in ('localhost', '127.0.0.1', '::1'):
            return False
        try:
            ip = ipaddress.ip_address(host)
            ips = [ip]
        except ValueError:
            try:
                infos = socket.getaddrinfo(host, None)
                ips = [ipaddress.ip_address(info[4][0]) for info in infos]
            except Exception:
                return False
        for ip in ips:
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                return False
        return True
    except Exception:
        return False


def normalize_avatar_data(avatar_url: str) -> str:
    if not avatar_url:
        return ''
    avatar_url = str(avatar_url).strip()
    if avatar_url.startswith('data:image/'):
        return avatar_url
    if avatar_url.startswith('http://') or avatar_url.startswith('https://'):
        if not is_safe_external_url(avatar_url):
            return ''
        try:
            resp = requests.get(
                avatar_url,
                timeout=3,
                stream=True,
                allow_redirects=False,
                headers={'User-Agent': 'CareerHeroPDF/1.0'}
            )
            if resp.status_code != 200:
                return ''
            content_type = (resp.headers.get('Content-Type') or 'image/png').split(';')[0].strip().lower()
            if not content_type.startswith('image/'):
                return ''
            data = resp.content[: 2 * 1024 * 1024]
            if not data:
                return ''
            encoded = base64.b64encode(data).decode('utf-8')
            return f"data:{content_type};base64,{encoded}"
        except Exception:
            return ''
    return ''

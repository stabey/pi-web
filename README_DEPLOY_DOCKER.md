# Docker Deployment

This deployment runs pi-web as an HTTP-only service in Docker. Put Caddy or
another reverse proxy on the host for the public domain, HTTPS, and certificates.

## 1. Prepare Secrets

Generate an auth secret:

```bash
openssl rand -base64 48
```

Generate a bcrypt password hash:

```bash
node -e 'const bcrypt=require("bcryptjs"); bcrypt.hash(process.argv[1], 12).then(console.log)' 'change-this-password'
```

Create `.env` next to `docker-compose.yml`:

```env
PI_WEB_ADMIN_USER=admin
PI_WEB_AUTH_SECRET=<random-secret>
PI_WEB_ADMIN_PASSWORD_HASH=<bcrypt-hash>
```

## 2. Prepare Workspaces

Create a local workspace folder. Only this folder is mounted into the container:

```bash
mkdir -p workspaces
```

Do not mount host root directories or the Docker socket into this container.

## 3. Start

```bash
docker compose up -d --build
```

The app listens on the host loopback interface:

```text
http://127.0.0.1:30141
```

## 4. Caddy Example

```caddyfile
ai.example.com {
    encode gzip

    reverse_proxy 127.0.0.1:30141 {
        flush_interval -1
    }

    request_body {
        max_size 64MB
    }
}
```

## Runtime Layout

```text
/data/pi-agent       Pi config, sessions, models, skills, plugins
/data/chat           Pure chat cwd
/data/workspaces     Coding mode workspaces
/data/uploads        Future asset uploads
/data/cache          Package manager caches
```

## Security Notes

- All pages and APIs are protected when `PI_WEB_AUTH_REQUIRED=true`.
- Chat mode uses `/data/chat/default` and does not expose file browsing.
- Coding mode accepts only paths under `PI_WEB_WORKSPACE_ROOTS`.
- The compose file binds `30141` to `127.0.0.1` so the public entrypoint is the host proxy.
- Do not mount `/`, `/home`, `/root`, `/etc`, or `/var/run/docker.sock`.

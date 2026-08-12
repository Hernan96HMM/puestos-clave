# Nginx — bloque de ejemplo para puestos-clave

Esto es un **ejemplo documentado**, no una config real editada — no hay
acceso desde esta sesión al Nginx real del host (corre fuera de Docker, en
el server). Agregar un bloque como este a la config existente, siguiendo la
misma convención que ya usan los demás proyectos SICA (`server {}` por
proyecto, `proxy_pass` a `localhost:<puerto>`).

```nginx
server {
    listen 443 ssl;
    server_name REEMPLAZAR.example.com;

    # certificados TLS ya gestionados por la config existente del host

    location / {
        proxy_pass http://localhost:8097;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Con TLS terminado ahí, `AUTH_URL` en `.env` debe ser `https://` — si no,
Auth.js no emite la cookie de sesión con `Secure` y el login no persiste
detrás del proxy.

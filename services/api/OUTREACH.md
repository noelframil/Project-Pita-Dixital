# Captación por email — manual de operación

Estado de la infraestructura: **terminada y probada**. Lo único que falta para
enviar son direcciones de personas.

## Lo que ya está montado

| Pieza | Estado |
|---|---|
| Dominio `deals.zenithrisecapital.com` | Verificado en Resend (DKIM + SPF, región UE) |
| Envío real | Probado, `last_event: delivered` |
| Baja en un clic | Probada por GET y por POST (RFC 8058) |
| Lista de supresión | Probada: tras la baja, el contacto deja de ser candidato |
| Campañas por operación | 11 generadas, una por expediente en comercialización |
| Cuentas objetivo | 416 importadas de Apollo, filtradas por sector |
| **Direcciones de persona** | **0 — es el único bloqueo** |

## Por qué el remitente es un subdominio

El correo de la empresa vive en `zenithrisecapital.com` con IONOS, y su SPF ya
lleva IONOS y MailerSend. Enviar desde la raíz habría obligado a tocar ese
registro, que es donde se rompe el correo de una empresa.

Con `deals.zenithrisecapital.com` la raíz no se toca y la reputación queda
aislada: si la captación en frío recibe quejas, no arrastra al dominio con el
que se habla con clientes reales.

**El remitente debe ser `algo@deals.zenithrisecapital.com`.** Usar
`deals@zenithrisecapital.com` da 403: esa es la raíz, que no está verificada.

**El subdominio no recibe correo.** Su MX existe solo para los rebotes de SES,
así que `OUTREACH_REPLY_TO` tiene que apuntar a un buzón real que alguien lea.

## Flujo completo

```bash
# 1. Cuentas objetivo (1 crédito de Apollo por página de 100)
npm run outreach -- import-accounts zrc outreach/accounts.zrc.json --prioridad 1 --live
npm run outreach -- prune-accounts zrc          # descarta sectores no compradores, 0 créditos
npm run outreach -- list-accounts zrc --segmento agroindustria

# 2. Contactos: revelar en la interfaz de Apollo y exportar a CSV
npm run outreach -- import-csv zrc lista.csv --segmento agroindustria --fuente apollo-ui

# 3. Campañas: una por operación en comercialización
npm run outreach -- make-deal-campaigns zrc deals.json --firmante "Nombre, cargo"
npm run outreach -- list-campaigns zrc
npm run outreach -- approve-campaign zrc <campaña> "<quien aprueba>"

# 4. Ensayo primero: sin --live no sale nada
npm run outreach -- run-campaign zrc <campaña>
npm run outreach -- run-campaign zrc <campaña> --live --limit 20
```

## Calentamiento del subdominio

`deals.zenithrisecapital.com` se creó hoy: **cero historial de envío**. Pasar de
cero a cientos de correos es la señal de spam más clara que existe.

| Semana | Máximo diario |
|---|---|
| 1 | 20–30 |
| 2 | 50–75 |
| 3 | 100–150 |
| 4+ | subir mientras los rebotes sigan por debajo del 2 % |

El ritmo por minuto lo pone `OUTREACH_SEND_PER_MINUTE`; el volumen diario lo
controlas tú con `--limit`.

## Los frenos, y por qué están

Tres cosas tienen que alinearse para que salga un correo. Es deliberado:

1. `OUTREACH_LIVE=true` en el `.env`. Se cambia a mano, nunca por código.
2. La campaña en estado `approved`. Una persona firma el texto que sale a
   nombre de la firma.
3. `--live` en el comando. Sin él, ensayo.

Además, antes de cada envío se cruza la lista de supresión en SQL —no en el
bucle— para que no dependa de que el bucle acierte siempre.

## Obligaciones que van en cada correo

- **Origen del dato.** Cuando la dirección viene de un tercero (Apollo), el
  RGPD obliga a decirlo en el primer contacto. Va automático en el pie.
- **Baja funcional.** Enlace en el cuerpo y cabeceras `List-Unsubscribe` +
  `List-Unsubscribe-Post`. Gmail y Yahoo las exigen a quien envía en volumen.
- **La baja es definitiva.** Entra en `suppression` y no se borra nunca.

## Rotar claves

`RESEND_API_KEY` se pegó en texto plano durante el desarrollo. Conviene
rotarla en resend.com/api-keys y actualizar el `.env`.

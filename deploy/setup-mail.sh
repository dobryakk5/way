#!/usr/bin/env bash
# One-time (idempotent) setup of outgoing mail for putst.ru: Postfix (send-only, loopback) + OpenDKIM.
# Run as root on the server:  ./deploy/setup-mail.sh
#
# Optional: relay through an external SMTP on port 587 instead of delivering directly
# (Hetzner blocks outbound port 25 until it is unlocked on request):
#   RELAYHOST='[smtp.example.com]:587' ./deploy/setup-mail.sh
#   then put "[smtp.example.com]:587 login:password" into /etc/postfix/sasl_passwd (mode 600),
#   run `postmap /etc/postfix/sasl_passwd && systemctl reload postfix`.
set -euo pipefail

DOMAIN=${MAIL_DOMAIN:-putst.ru}
SELECTOR=${DKIM_SELECTOR:-putst.ru}
KEY_DIR=/etc/opendkim/keys/$DOMAIN

echo "== packages"
echo "postfix postfix/mailname string $DOMAIN" | debconf-set-selections
echo "postfix postfix/main_mailer_type select Internet Site" | debconf-set-selections
DEBIAN_FRONTEND=noninteractive apt-get install -y postfix opendkim opendkim-tools libsasl2-modules >/dev/null

echo "== postfix"
postconf -e "myhostname = $DOMAIN" \
            "myorigin = $DOMAIN" \
            "mydestination = localhost" \
            "inet_interfaces = loopback-only" \
            "inet_protocols = ipv4" \
            "mynetworks = 127.0.0.0/8" \
            "smtpd_milters = inet:127.0.0.1:8891" \
            "non_smtpd_milters = inet:127.0.0.1:8891" \
            "milter_default_action = accept" \
            "smtp_tls_security_level = may" \
            "disable_vrfy_command = yes"
if [ -n "${RELAYHOST:-}" ]; then
  postconf -e "relayhost = $RELAYHOST" \
              "smtp_sasl_auth_enable = yes" \
              "smtp_sasl_password_maps = hash:/etc/postfix/sasl_passwd" \
              "smtp_sasl_security_options = noanonymous" \
              "smtp_tls_security_level = encrypt"
fi

echo "== opendkim"
mkdir -p "$KEY_DIR"
if [ ! -f "$KEY_DIR/$SELECTOR.private" ]; then
  opendkim-genkey -b 2048 -d "$DOMAIN" -s "$SELECTOR" -D "$KEY_DIR"
fi
chown -R opendkim:opendkim /etc/opendkim
chmod 700 "$KEY_DIR"; chmod 600 "$KEY_DIR/$SELECTOR.private"
cat > /etc/opendkim.conf <<CONF
Syslog                  yes
UMask                   007
Mode                    s
Domain                  $DOMAIN
Selector                $SELECTOR
KeyFile                 $KEY_DIR/$SELECTOR.private
Canonicalization        relaxed/simple
Socket                  inet:8891@127.0.0.1
PidFile                 /run/opendkim/opendkim.pid
UserID                  opendkim
OversignHeaders         From
CONF

systemctl enable --now opendkim postfix >/dev/null
systemctl restart opendkim postfix

echo
echo "== DNS: set this TXT record at the DNS provider (name: $SELECTOR._domainkey.$DOMAIN)"
tr -d '\n\t' < "$KEY_DIR/$SELECTOR.txt" | sed -E 's/" +"//g; s/^[^(]*\( *//; s/ *\).*$//'
echo

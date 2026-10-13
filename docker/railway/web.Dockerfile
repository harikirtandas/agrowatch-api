FROM php:8.4-cli-alpine

COPY web/ /var/www/html/

# pisa el config.js de desarrollo (apunta a localhost:8080, para docker-compose
# local) con el de produccion, que apunta al dominio real del servicio api-rest
# en Railway. Asi web/js/config.js del repo no se toca para nada.
COPY docker/railway/config.prod.js /var/www/html/js/config.js

EXPOSE 80

CMD ["php", "-S", "0.0.0.0:80", "-t", "/var/www/html"]

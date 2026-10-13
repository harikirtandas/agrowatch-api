FROM php:8.4-apache

# igual que docker/web/Dockerfile (el equivalente local): Apache con
# mod_rewrite, no el servidor embebido de PHP, porque php -S ignora
# web/.htaccess (que resuelve "/" -> landing y "/algo.html" -> html/algo.html
# transparente) y el hosting real de destino es Apache.
RUN a2enmod rewrite

COPY docker/apache/web.conf /etc/apache2/sites-available/000-default.conf

WORKDIR /var/www/html

# a diferencia de docker/web/Dockerfile (que usa bind mount en local),
# Railway no soporta bind mounts: el codigo se copia adentro de la imagen.
COPY web/ /var/www/html/

# pisa el config.js de desarrollo (apunta a localhost:8080, para docker-compose
# local) con el de produccion, que apunta al dominio real del servicio api-rest
# en Railway. Asi web/js/config.js del repo no se toca para nada.
COPY docker/railway/config.prod.js /var/www/html/js/config.js

# mismo bug que en app.Dockerfile: la imagen php:*-apache deja mas de un MPM
# cargado al arrancar el contenedor aunque el build quede limpio
# ("AH00534: More than one MPM loaded"), hay que repetir el fix en el arranque.
CMD a2dismod mpm_event mpm_worker mpm_itk 2>/dev/null; a2enmod mpm_prefork; exec apache2-foreground

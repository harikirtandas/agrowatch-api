FROM php:8.4-apache

RUN apt-get update && apt-get install -y --no-install-recommends \
    libzip-dev unzip git \
    && rm -rf /var/lib/apt/lists/*

RUN docker-php-ext-install pdo_mysql mysqli zip bcmath
RUN a2enmod rewrite

# mod_php (con el que corre esta imagen, no php-fpm) solo funciona con el MPM
# prefork; si queda mas de un MPM cargado Apache no arranca
# ("AH00534: More than one MPM loaded"). El build anterior mostro que
# mpm_event ya estaba disabled y mpm_prefork ya enabled, asi que el
# conflicto viene de otro MPM (worker/itk) - se listan los mods-enabled para
# confirmarlo en el log de build, y se fuerza a dejar solo prefork.
RUN a2dismod mpm_event mpm_worker mpm_itk 2>/dev/null; \
    a2enmod mpm_prefork; \
    ls -la /etc/apache2/mods-enabled/ | grep -i mpm

COPY --from=composer:latest /usr/bin/composer /usr/bin/composer
COPY docker/apache/000-default.conf /etc/apache2/sites-available/000-default.conf
COPY docker/php/php.ini /usr/local/etc/php/conf.d/zz-dev.ini

WORKDIR /var/www/html

# a diferencia del Dockerfile local (docker/Dockerfile), aca SI copiamos el
# codigo adentro de la imagen: Railway no soporta bind mounts como
# docker-compose, el codigo tiene que quedar horneado en la imagen.
COPY src/ /var/www/html/
RUN composer install --no-dev -o

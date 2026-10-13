FROM php:8.4-apache

RUN apt-get update && apt-get install -y --no-install-recommends \
    libzip-dev unzip git \
    && rm -rf /var/lib/apt/lists/*

RUN docker-php-ext-install pdo_mysql mysqli zip bcmath
RUN a2enmod rewrite

# la imagen base trae el MPM "event" habilitado ademas del "prefork"; mod_php
# (que es con el que corre esta imagen, no php-fpm) solo funciona con
# prefork, asi que si quedan los dos cargados Apache no arranca
# ("AH00534: More than one MPM loaded").
RUN a2dismod mpm_event || true
RUN a2enmod mpm_prefork

COPY --from=composer:latest /usr/bin/composer /usr/bin/composer
COPY docker/apache/000-default.conf /etc/apache2/sites-available/000-default.conf
COPY docker/php/php.ini /usr/local/etc/php/conf.d/zz-dev.ini

WORKDIR /var/www/html

# a diferencia del Dockerfile local (docker/Dockerfile), aca SI copiamos el
# codigo adentro de la imagen: Railway no soporta bind mounts como
# docker-compose, el codigo tiene que quedar horneado en la imagen.
COPY src/ /var/www/html/
RUN composer install --no-dev -o

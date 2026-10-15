FROM php:8.4-apache

RUN apt-get update && apt-get install -y --no-install-recommends \
    libzip-dev unzip git \
    && rm -rf /var/lib/apt/lists/*

RUN docker-php-ext-install pdo_mysql mysqli zip bcmath
RUN a2enmod rewrite

COPY --from=composer:latest /usr/bin/composer /usr/bin/composer
COPY docker/apache/000-default.conf /etc/apache2/sites-available/000-default.conf
COPY docker/php/php.prod.ini /usr/local/etc/php/conf.d/zz-prod.ini

WORKDIR /var/www/html

# a diferencia del Dockerfile local (docker/Dockerfile), aca SI copiamos el
# codigo adentro de la imagen: Railway no soporta bind mounts como
# docker-compose, el codigo tiene que quedar horneado en la imagen.
COPY src/ /var/www/html/
RUN composer install --no-dev -o

# mod_php (con el que corre esta imagen, no php-fpm) solo funciona con el MPM
# prefork; si queda mas de un MPM cargado Apache no arranca
# ("AH00534: More than one MPM loaded"). Confirmado que en el BUILD
# mods-enabled queda limpio (solo prefork) con a2dismod/a2enmod, pero el
# entrypoint de esta imagen vuelve a tocar los MPM al ARRANCAR el contenedor
# (bug conocido de php:*-apache en Railway) - por eso el fix hay que
# repetirlo justo antes de levantar Apache, no solo en el build.
CMD a2dismod mpm_event mpm_worker mpm_itk 2>/dev/null; a2enmod mpm_prefork; exec apache2-foreground

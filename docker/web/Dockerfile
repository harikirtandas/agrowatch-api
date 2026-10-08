FROM php:8.4-apache

RUN a2enmod rewrite

COPY docker/apache/web.conf /etc/apache2/sites-available/000-default.conf

WORKDIR /var/www/html

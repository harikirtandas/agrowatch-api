FROM php:8.4-cli-alpine

COPY web/ /var/www/html/

EXPOSE 80

CMD ["php", "-S", "0.0.0.0:80", "-t", "/var/www/html"]

FROM python:3.12-slim

WORKDIR /app
COPY app /app/app

ENV HOST=0.0.0.0
ENV PORT=5063
ENV MICROBIOTA_NO_BROWSER=1
ENV DATA_DIR=/app/data

EXPOSE 5063
VOLUME ["/app/data"]

CMD ["python", "app/app.py"]

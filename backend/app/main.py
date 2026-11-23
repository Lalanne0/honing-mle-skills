from fastapi import FastAPI

app = FastAPI(title="honing-mle-skills")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

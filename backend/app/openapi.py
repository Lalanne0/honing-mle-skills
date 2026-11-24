"""Print the API's OpenAPI spec as JSON. The frontend's `npm run gen:api` reads it."""

import json

from app.main import app


def main() -> None:
    print(json.dumps(app.openapi(), indent=2))


if __name__ == "__main__":
    main()

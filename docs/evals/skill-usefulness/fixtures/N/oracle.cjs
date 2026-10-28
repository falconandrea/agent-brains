module.exports = async function handle(body, repository) {
  if (!body || Array.isArray(body) || typeof body.name !== "string") {
    return { status: 400, body: { error: "invalid_name" } };
  }
  const name = body.name.trim();
  if (name.length < 1 || name.length > 80) {
    return { status: 400, body: { error: "invalid_name" } };
  }
  try {
    return { status: 201, body: await repository.create(name) };
  } catch {
    return { status: 500, body: { error: "internal_error" } };
  }
};

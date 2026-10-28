module.exports = async function handle(body, repository) {
  const record = await repository.create(body.name);
  return { status: 201, body: record };
};

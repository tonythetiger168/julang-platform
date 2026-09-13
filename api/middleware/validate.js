function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const msg = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      return res.status(400).json({ code: 400, message: '參數錯誤', errors: msg });
    }
    req.validated = result.data;
    next();
  };
}

module.exports = validate;
module.exports.validate = validate;

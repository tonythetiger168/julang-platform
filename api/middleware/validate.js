/* ===== 請求體驗證中介軟體 (v7.2) =====
 *
 * 原始 repo 缺少此檔，但 6 個路由檔都以 validate(schema) 使用它，其中
 * routes/creator.js 還用 `{ validate }` 解構，所以預設匯出與具名匯出都要提供。
 *
 * 呼叫點一律傳入 controller 匯出的 zod schema（例如
 * creatorController.createDramaSchema），驗證的是 req.body。
 * （v7.3：原本這裡舉的 agentController.blueprintSchema 隨 /ai/agent 移除，改舉現存的例子。）
 */
function validate(schema) {
  if (!schema || typeof schema.safeParse !== 'function') {
    // 這是路由定義層的程式錯誤：寧願在啟動時就爆，也不要在執行期默默放行
    throw new TypeError('validate(schema) 需要一個 zod schema（缺少 safeParse）');
  }

  return function validateBody(req, res, next) {
    const result = schema.safeParse(req.body === undefined ? {} : req.body);
    if (!result.success) {
      const issues = (result.error && result.error.issues) || [];
      return res.status(400).json({
        code: 400,
        message: '請求參數不合法',
        errors: issues.map((i) => ({ path: (i.path || []).join('.'), message: i.message })),
      });
    }
    // 用解析後的結果覆蓋，讓下游拿到已轉型／已去除多餘欄位的資料
    req.body = result.data;
    next();
  };
}

module.exports = validate;
module.exports.validate = validate;

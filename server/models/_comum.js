// Transformação padrão do JSON devolvido ao front-end: "_id" vira "id" (como era no MongoDB)
function jsonPadrao(extra) {
  return (doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    if (extra) extra(ret, doc);
  };
}
const str = (v) => (v === null || v === undefined ? null : String(v));
module.exports = { jsonPadrao, str };

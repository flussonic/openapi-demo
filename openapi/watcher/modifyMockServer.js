/**
 * @param {string} operationId
 * @param {Express} app
 * @param {Object} response
 * @param {string} schemaName
 * @param {object} res - express response
 * @param {object} req - express request
 */
exports.modifyResponse = function ({
   operationId,
   app,
   response,
   schemaName,
   res,
   req
}) {
    // проверка авторизации
    if (!req.headers?.authorization || req.headers.authorization === 'undefined') {
        res.status(401);
    }
    if (operationId === 'login_create') {
        const tokenPayload = {
            // set token expires in 1 min
            exp: Math.floor(Date.now() / 1000) + 60
        }
        response.access_token = `a.${btoa(JSON.stringify(tokenPayload))}.a`;
    }
    return response;
}
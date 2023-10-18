/**
 * @param {string} operationId
 * @param {Object} response
 * @param getBase64FileContent
 */
exports.modifyResponse = function ({
  operationId,
  response,
  getBase64FileContent,
}) {
  if(operationId === "ui_settings_get") {
    response = {
      ...response,
      logo: getBase64FileContent('logoHeaderClientArea.png'),
      logoAuth: getBase64FileContent('logoLoginClientArea.png'),
      favicons: {
        "16": getBase64FileContent('favicon-16.png'),
        "32": getBase64FileContent('favicon-32.png'),
        "48": getBase64FileContent('favicon-48.png'),
        "64": getBase64FileContent('favicon-64.png'),
        "128": getBase64FileContent('favicon-128.png'),
      },
      fonts: {
        "light": getBase64FileContent('fira-sans-300.woff2'),
        "medium": getBase64FileContent('fira-sans-500.woff2'),
        "regular": getBase64FileContent('fira-sans-400.woff2'),
      }
    };
  }

  return response;
}

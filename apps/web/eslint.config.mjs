import nextConfig from "eslint-config-next";
import baseConfig from "../../eslint.config.mjs";

export default [...baseConfig, ...nextConfig];

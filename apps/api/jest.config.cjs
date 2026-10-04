module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/src/**/*.spec.ts", "<rootDir>/test/**/*.spec.ts"],
  setupFiles: ["<rootDir>/test/setup.ts"],
  globals: {
    "ts-jest": {
      tsconfig: {
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        types: ["jest", "node"],
        module: "CommonJS",
        moduleResolution: "Node",
        strictPropertyInitialization: false,
      },
    },
  },
};

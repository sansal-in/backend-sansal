const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');

const setupSwagger = (app) => {
  try {
    // Load the existing static YAML as the base definition
    const baseDocument = YAML.load(path.join(__dirname, 'swagger.yaml'));

    // Add servers configuration for both production and local
    baseDocument.servers = [
      
      {
        url: 'https://sansal-backend-xyzsandeepsansal.onrender.com/api',
        description: 'Production Server'
      },{
        url: 'http://localhost:5000/api',
        description: 'Local Development'
      }
    ];

    // Ensure securitySchemes are properly defined
    if (!baseDocument.components) {
      baseDocument.components = {};
    }
    
    baseDocument.components.securitySchemes = {
      ...baseDocument.components.securitySchemes,
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    };

    // Add global security requirement (optional)
    if (!baseDocument.security) {
      baseDocument.security = [
        {
          bearerAuth: []
        }
      ];
    }

    const options = {
      definition: baseDocument,
      apis: [path.join(__dirname, './routes/*.js').replace(/\\/g, '/')], // Scan all route files for @swagger comments (Windows fix)
    };

    const swaggerSpec = swaggerJsdoc(options);
    
    // Serve Swagger UI with proper configuration
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
      swaggerOptions: {
        persistAuthorization: true, // Keeps the authorization token after refresh
        tryItOutEnabled: true, // Enables "Try it out" by default
        displayRequestDuration: true,
        defaultModelsExpandDepth: 3,
        defaultModelExpandDepth: 3,
        docExpansion: 'none',
        // filter: true // Enables a search bar to filter tags
      },
      explorer: true,
      customSiteTitle: "Sansal API Documentation"
    }));
    
    // Serve swagger.json separately
    app.get('/swagger.json', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(swaggerSpec);
    });

    //console.log('📄 Swagger UI available at /api-docs');
  } catch (err) {
    console.error('❌ Could not load swagger configuration:', err.message);
  }
};

module.exports = setupSwagger;
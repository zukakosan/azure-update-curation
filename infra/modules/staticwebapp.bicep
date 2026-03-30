@description('Name of the Static Web App')
param name string

@description('Location for the Static Web App')
param location string

@description('Tags for the resource')
param tags object = {}

resource staticWebApp 'Microsoft.Web/staticSites@2022-09-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
    buildProperties: {
      skipGithubActionWorkflowGeneration: true
    }
  }
}

output uri string = 'https://${staticWebApp.properties.defaultHostname}'
output name string = staticWebApp.name

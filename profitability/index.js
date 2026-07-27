'use strict'

const accessPolicy = require('../profitability-entitlement-policy')
const domain = require('./domain')
const repository = require('./repository')

module.exports = {
  ...accessPolicy,
  ...domain,
  ...repository,
}

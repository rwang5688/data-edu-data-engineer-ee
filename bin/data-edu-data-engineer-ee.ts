#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { DataEduDataEngineerEeStack } from '../lib/data-edu-data-engineer-ee-stack';

const app = new cdk.App();
new DataEduDataEngineerEeStack(app, 'DataEduDataEngineerEeStack');

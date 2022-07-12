import * as cdk from "aws-cdk-lib";
import * as kms from "aws-cdk-lib/aws-kms";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as dms from "aws-cdk-lib/aws-dms";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as eb from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import { Construct } from "constructs";

export class DataEduDataEngineerEeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Event Engine Parameters
    // Remove Default for EE Modules
    const EETeamId = new cdk.CfnParameter(this, "EETeamId", {
      type: "String",
      default: "123456789012",
      description: "Unique ID of this Team",
    });
    const GUID = EETeamId.valueAsString;

    // DMS Role Creation CloudFormation Parameter + Condition
    const createDMSRole = new cdk.CfnParameter(this, "createDMSRole", {
      allowedValues: ["true", "false"],
      constraintDescription: "Value must be set to true or false.",
      default: "true",
      description:
        "Set this value to false if the 'dms-vpc-role' IAM Role has already been created in this AWS Account.",
    });

    const createDMSRoleCondition = new cdk.CfnCondition(
      this,
      "createDMSRoleCondition",
      {
        expression: cdk.Fn.conditionEquals(createDMSRole, "true"),
      }
    );

    // KMS Key Name
    const KeyName = "dataedu-key";

    // S3 Bucket Names
    const RawBucketName = "dataedu-raw-";
    const CuratedBucketName = "dataedu-curated-";
    const ResultsBucketName = "dataedu-results-";

    // Key Policy json
    const keyPolicyJson = {
      Id: "key-consolepolicy-3",
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "Enable IAM User Permissions",
          Effect: "Allow",
          Principal: {
            AWS: "arn:aws:iam::" + cdk.Stack.of(this).account + ":root",
          },
          Action: "kms:*",
          Resource: "*",
        },
      ],
    };

    // Create KMS Policy (CDK does not generate UI Editable KMS Policy)
    // MANUALLY ADD TO KEY POLICY IN SYNTHESIZED JSON: "Id": "key-consolepolicy-3"
    // This enables adding users to the Key Policy via the IAM UI
    const keyPolicy = iam.PolicyDocument.fromJson(keyPolicyJson);

    // Create KMS Key
    const key = new kms.Key(this, "dataeduKMS", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pendingWindow: cdk.Duration.days(7),
      alias: KeyName,
      description: "KMS key to encrypt objects in the dataEDU S3 buckets.",
      enableKeyRotation: true,
      policy: keyPolicy,
    });

    // Create RAW Bucket
    const rawBucket = new s3.Bucket(this, "dataeduRawBucket", {
      bucketName: cdk.Fn.join("", [RawBucketName, GUID]),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: key,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
    });

    rawBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ["s3:PutObject"],
        resources: [`${rawBucket.bucketArn}/*`],
        conditions: {
          StringEquals: { "s3:x-amz-server-side-encryption": "AES256" },
        },
      })
    );

    rawBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ["s3:PutObject"],
        resources: [`${rawBucket.bucketArn}/*`],
        conditions: {
          StringNotLikeIfExists: {
            "s3:x-amz-server-side-encryption-aws-kms-key-id": key.keyArn,
          },
        },
      })
    );

    // Create CURATED Bucket
    const curatedBucket = new s3.Bucket(this, "dataeduCuratedBucket", {
      bucketName: cdk.Fn.join("", [CuratedBucketName, GUID]),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: key,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
    });

    curatedBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ["s3:PutObject"],
        resources: [`${curatedBucket.bucketArn}/*`],
        conditions: {
          StringEquals: { "s3:x-amz-server-side-encryption": "AES256" },
        },
      })
    );

    curatedBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ["s3:PutObject"],
        resources: [`${curatedBucket.bucketArn}/*`],
        conditions: {
          StringNotLikeIfExists: {
            "s3:x-amz-server-side-encryption-aws-kms-key-id": key.keyArn,
          },
        },
      })
    );

    // Create RESULTS Bucket
    const resultsBucket = new s3.Bucket(this, "dataeduResultsBucket", {
      bucketName: cdk.Fn.join("", [ResultsBucketName, GUID]),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: key,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
    });

    resultsBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ["s3:PutObject"],
        resources: [`${resultsBucket.bucketArn}/*`],
        conditions: {
          StringEquals: { "s3:x-amz-server-side-encryption": "AES256" },
        },
      })
    );

    resultsBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ["s3:PutObject"],
        resources: [`${resultsBucket.bucketArn}/*`],
        conditions: {
          StringNotLikeIfExists: {
            "s3:x-amz-server-side-encryption-aws-kms-key-id": key.keyArn,
          },
        },
      })
    );

    // IAM Role for dms-vpc-role
    const dmsVPCRolePolicy = iam.ManagedPolicy.fromAwsManagedPolicyName(
      "service-role/AmazonDMSVPCManagementRole"
    );

    const dmsVPCRole = new iam.Role(this, "dataeduDMSVPCRole", {
      assumedBy: new iam.ServicePrincipal("dms.amazonaws.com"),
      roleName: "dms-vpc-role",
      managedPolicies: [dmsVPCRolePolicy],
    });

    dmsVPCRole.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    // Create dms-vpc-role only if the createDMSRole CFT Parameter is set to "true"
    (dmsVPCRole.node.defaultChild as iam.CfnRole).cfnOptions.condition =
      createDMSRoleCondition;

    // IAM Role for DMS Source Endpoint to Secrets Manager Access
    const dmsSourceEndpointExecutionRole = new iam.Role(
      this,
      "dataeduDMSSourceRole",
      {
        assumedBy: new iam.ServicePrincipal(
          "dms." + cdk.Stack.of(this).region + ".amazonaws.com"
        ),
        roleName: "dataedu-dms-source-execution-role",
      }
    );

    // IAM Role for DMS Target Endpoint to S3 Access
    const dmsTargetEndpointExecutionRole = new iam.Role(
      this,
      "dataeduDMSTargetRole",
      {
        assumedBy: new iam.ServicePrincipal("dms.amazonaws.com"),
        roleName: "dataedu-dms-target-execution-role",
      }
    );

    // IAM Role for SIS Import Lambda Execution Role
    const sisLambdaExecutionRole = new iam.Role(this, "dataeduSISImportRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      roleName: "dataedu-sis-import-lambda-execution-role",
    });

    // IAM Role for LMS S3 Fetch Lambda Execution Role
    const lmsS3FetchRole = new iam.Role(this, "dataeduLMSS3FetchRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      roleName: "dataedu-fetch-s3-lambda-role",
    });

    // IAM Role for LMS API Fetch Lambda Execution Role
    const lmsAPIFetchRole = new iam.Role(this, "dataeduLMSAPIFetchRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      roleName: "dataedu-fetch-s3-data-role",
    });

    // Create VPC
    const vpc = new ec2.Vpc(this, "dataeduVPC", {
      cidr: "10.0.0.0/16",
      natGateways: 2,
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: "dataedu-public-",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
          mapPublicIpOnLaunch: false,
        },
        {
          name: "dataedu-private-",
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
          cidrMask: 24,
        },
      ],
    });

    // Create RDS Secret
    const rdsSecret = new secretsmanager.Secret(this, "dataEDURDSSecret", {
      secretName: "dataedu-rds-secret",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "admin" }),
        generateStringKey: "password",
        excludePunctuation: true,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Grant DMS Target Endpoint Role access to S3 Bucket + KMS Key
    rawBucket.grantReadWrite(dmsTargetEndpointExecutionRole);

    // Grant DMS Source Endpoint Role access to KMS Key (for Secrets Manager) + Secrets Manager Values
    key.grantDecrypt(dmsSourceEndpointExecutionRole);
    rdsSecret.grantRead(dmsSourceEndpointExecutionRole);

    // Grant SIS Import Lambda Function access to KMS Key + Secrets Manager Secret Values
    key.grantDecrypt(sisLambdaExecutionRole);
    rdsSecret.grantRead(sisLambdaExecutionRole);

    // Create RDS Instance Security Group
    const rdsInstanceSG = new ec2.SecurityGroup(this, "dataeduRDSsg", {
      vpc: vpc,
      allowAllOutbound: true,
      description: "DataEDU RDS Instance security group",
    });

    // Create DMS Instance Security Group
    const dmsInstanceSG = new ec2.SecurityGroup(this, "dataeduDMSsg", {
      vpc: vpc,
      allowAllOutbound: true,
      description: "DataEDU DMS Instance security group",
    });

    // Create SIS Import Lambda Function Security Group
    const sisLambdaSG = new ec2.SecurityGroup(this, "dataeduLambdasg", {
      vpc: vpc,
      allowAllOutbound: true,
      description: "DataEDU SIS Import Lambda Function security group",
    });

    // Allow DMS SG to communicate to RDS SG
    rdsInstanceSG.connections.allowFrom(
      new ec2.Connections({ securityGroups: [dmsInstanceSG] }),
      ec2.Port.tcp(3306),
      "DMS to RDS (MySQL)"
    );

    // Allow SIS Import Lambda Function SG to communicate to RDS SG
    rdsInstanceSG.connections.allowFrom(
      new ec2.Connections({ securityGroups: [sisLambdaSG] }),
      ec2.Port.tcp(3306),
      "SIS Import Lambda to RDS (MySQL)"
    );

    // Create RDS Instance, defaults to m5.large
    const rdsInstance = new rds.DatabaseInstance(this, "dataeduRDSInstance", {
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0_26,
      }),
      vpc: vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_NAT },
      credentials: rds.Credentials.fromSecret(rdsSecret),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      securityGroups: [rdsInstanceSG],
      storageEncrypted: true,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      publiclyAccessible: false,
      allocatedStorage: 20,
      storageType: rds.StorageType.GP2,
      instanceIdentifier: "dataedu-rds-instance",
    });

    // Convert ISubnet array into an array of strings for the L1 replication subnet group
    const privateSubnetIds = vpc.privateSubnets.map(function (item) {
      return item["subnetId"];
    });

    // Create L1 DMS Replication Subnet Group
    const dmsSubnetGroup = new dms.CfnReplicationSubnetGroup(
      this,
      "dataeduDMSSubnetGroup",
      {
        replicationSubnetGroupIdentifier: "dataedu-replication-subnet-group",
        replicationSubnetGroupDescription: "dataedu-replication-subnet-group",
        subnetIds: privateSubnetIds,
      }
    );

    // Create L1 DMS Instance
    const dmsInstance = new dms.CfnReplicationInstance(
      this,
      "dataeduDMSInstance",
      {
        replicationInstanceClass: "dms.t3.micro",
        replicationInstanceIdentifier: "dataedu-dms-replication-instance",
        replicationSubnetGroupIdentifier: dmsSubnetGroup.ref,
        vpcSecurityGroupIds: [dmsInstanceSG.securityGroupId],
        allocatedStorage: 20,
        publiclyAccessible: false,
      }
    );

    // Create L1 DMS Source Endpoint
    const dmsSourceEndpoint = new dms.CfnEndpoint(
      this,
      "dataeduDMSSourceEndpoint",
      {
        endpointType: "source",
        engineName: "mysql",
        endpointIdentifier: "dataedu-dms-source-endpoint",
        mySqlSettings: {
          secretsManagerSecretId: rdsSecret.secretArn,
          secretsManagerAccessRoleArn: dmsSourceEndpointExecutionRole.roleArn,
        },
      }
    );

    // Adds a dependency to the DMS Source Endpoint, so on stack delete the DMS Source Endpoint is deleted before the dms-vpc-role
    //dmsSourceEndpoint.node.addDependency(lmsS3FetchRole);

    // Create L1 DMS Target Endpoint
    /*    const dmsTargetEndpoint = new dms.CfnEndpoint(
      this,
      "dataeduDMSTargetEndpoint",
      {
        endpointType: "target",
        engineName: "s3",
        endpointIdentifier: "dataedu-dms-target-endpoint",
        s3Settings: {
          bucketName: rawBucket.bucketName,
          serviceAccessRoleArn: dmsTargetEndpointExecutionRole.roleArn,
          bucketFolder: "sisdb",
        },
        extraConnectionAttributes: `encryptionMode=SSE_KMS;serverSideEncryptionKmsKeyId=${key.keyArn};dataFormat=parquet`,
      }
    );*/

    // Import Event Engine Asset Bucket
    const eeBucket = s3.Bucket.fromBucketName(
      this,
      "dataeduEEBucketName",
      "ee-assets-prod-" + cdk.Stack.of(this).region
    );

    // Create SIS Import Lambda Function Layer for MySQL
    const sisLambdaLayer = new lambda.LayerVersion(
      this,
      "dataeduSISLambdaLayer",
      {
        code: lambda.Code.fromBucket(
          eeBucket,
          "modules/cfdd4f678e99415a9c1f11342a3a9887/v1/lambda/mysql_layer.zip"
        ),
        compatibleRuntimes: [
          lambda.Runtime.PYTHON_3_7,
          lambda.Runtime.PYTHON_3_8,
        ],
      }
    );

    // Create SIS Import Lambda Function
    const sisLambdaImport = new lambda.Function(
      this,
      "dataeduSISLambdaFunction",
      {
        code: lambda.Code.fromBucket(
          eeBucket,
          "modules/cfdd4f678e99415a9c1f11342a3a9887/v1/lambda/dataedu-load-sisdb.zip"
        ),
        runtime: lambda.Runtime.PYTHON_3_8,
        handler: "lambda_function.lambda_handler",
        functionName: "dataedu-load-sisdb",
        memorySize: 512,
        timeout: cdk.Duration.seconds(900),
        layers: [sisLambdaLayer],
        environment: {
          secret_name: rdsSecret.secretName,
          region_name: cdk.Stack.of(this).region,
        },
        vpc: vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_NAT },
        role: sisLambdaExecutionRole,
        securityGroups: [sisLambdaSG],
        reservedConcurrentExecutions: 10,
      }
    );

    // Add policies to SIS Import Lambda Execution Role
    sisLambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "ec2:CreateNetworkInterface",
          "ec2:DeleteNetworkInterface",
          "ec2:AttachNetworkInterface",
        ],
        resources: [
          "arn:aws:ec2:" +
            cdk.Stack.of(this).region +
            ":" +
            cdk.Stack.of(this).account +
            ":*",
        ],
      })
    );
    sisLambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ec2:DescribeNetworkInterfaces"],
        resources: ["*"],
      })
    );
    sisLambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["lambda:InvokeFunction", "lambda:InvokeAsync"],
        resources: [
          "arn:aws:lambda:" +
            cdk.Stack.of(this).region +
            ":" +
            cdk.Stack.of(this).account +
            ":function:dataedu-*",
        ],
      })
    );
    sisLambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ],
        resources: [
          "arn:aws:logs:" +
            cdk.Stack.of(this).region +
            ":" +
            cdk.Stack.of(this).account +
            ":log-group:/aws/lambda/dataedu-load-sisdb",
        ],
      })
    );

    // Create LMS Config Parameter
    const lmsSSMParam = new ssm.StringParameter(this, "dataeduSSMParam", {
      parameterName: "/dataedu/lms-demo/state",
      description: "SSM Parameter for mock LMS integration.",
      stringValue:
        '{"base_url":"ee-assets-prod-' +
        cdk.Stack.of(this).region +
        '.s3.amazonaws.com/modules/cfdd4f678e99415a9c1f11342a3a9887/v1/mockdata/lms_demo","version": "v1", "current_date": "2020-08-17", "perform_initial_load": "1","target_bucket":"' +
        rawBucket.bucketName +
        '", "base_s3_prefix":"lmsapi"}',
    });

    // Create LMS S3 Fetch Lambda Function
    const lmsS3FetchLambda = new lambda.Function(
      this,
      "dataeduLMSS3FetchLambda",
      {
        code: lambda.Code.fromBucket(
          eeBucket,
          "modules/cfdd4f678e99415a9c1f11342a3a9887/v1/lambda/dataedu-fetch-s3-data.zip"
        ),
        runtime: lambda.Runtime.PYTHON_3_7,
        handler: "lambda_handler.lambda_handler",
        functionName: "dataedu-fetch-s3-data",
        memorySize: 256,
        timeout: cdk.Duration.seconds(600),
        role: lmsS3FetchRole,
        reservedConcurrentExecutions: 10,
        description:
          "Lambda function that fetches a file from a URL and stores it in a S3 bucket",
      }
    );

    // Add policies to LMS S3 Fetch Lambda Execution Role
    lmsS3FetchRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:ListBucket"],
        resources: [rawBucket.bucketArn],
      })
    );
    lmsS3FetchRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
        resources: [rawBucket.bucketArn + "/*"],
      })
    );
    lmsS3FetchRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ],
        resources: [
          "arn:aws:logs:" +
            cdk.Stack.of(this).region +
            ":" +
            cdk.Stack.of(this).account +
            ":log-group:/aws/lambda/dataedu-fetch-s3-data",
        ],
      })
    );

    // Create LMS API Fetch Lambda Function
    const lmsAPIFetchLambda = new lambda.Function(
      this,
      "dataeduLMSAPIFetchLambda",
      {
        code: lambda.Code.fromBucket(
          eeBucket,
          "modules/cfdd4f678e99415a9c1f11342a3a9887/v1/lambda/dataedu-fetch-lmsapi.zip"
        ),
        runtime: lambda.Runtime.PYTHON_3_7,
        handler: "lambda_function.lambda_handler",
        functionName: "dataedu-fetch-lmsapi",
        memorySize: 256,
        timeout: cdk.Duration.seconds(600),
        role: lmsAPIFetchRole,
        description:
          "Lambda function that mimics invoking an API to obtain data from a SaaS app",
        reservedConcurrentExecutions: 10,
      }
    );

    // Create EventBridge Rule
    const lmsAPIEventRule = new eb.Rule(this, "dataeduEventBridgeRule", {
      description: "Invokes demo API on a scheduled basis",
      ruleName: "dataedu-lmsapi-sync",
      schedule: eb.Schedule.rate(cdk.Duration.minutes(1)),
      enabled: false,
    });

    // Add Lambda Target to Event Rule
    lmsAPIEventRule.addTarget(new targets.LambdaFunction(lmsAPIFetchLambda));

    // Add policies to LMS API Fetch Lambda Execution Role
    lmsAPIFetchRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ssm:PutParameter", "ssm:GetParameter"],
        resources: [lmsSSMParam.parameterArn],
      })
    );
    lmsAPIFetchRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["lambda:InvokeFunction", "lambda:InvokeAsync"],
        resources: [
          "arn:aws:lambda:" +
            cdk.Stack.of(this).region +
            ":" +
            cdk.Stack.of(this).account +
            ":function:dataedu-*",
        ],
      })
    );
    lmsAPIFetchRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["events:DisableRule"],
        resources: [
          "arn:aws:events:" +
            cdk.Stack.of(this).region +
            ":" +
            cdk.Stack.of(this).account +
            ":rule/dataedu-lmsapi-sync",
        ],
      })
    );
    lmsAPIFetchRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ],
        resources: [
          "arn:aws:logs:" +
            cdk.Stack.of(this).region +
            ":" +
            cdk.Stack.of(this).account +
            ":log-group:/aws/lambda/dataedu-fetch-lmsapi",
        ],
      })
    );
  }
}

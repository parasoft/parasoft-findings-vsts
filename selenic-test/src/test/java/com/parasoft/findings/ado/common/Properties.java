package com.parasoft.findings.ado.common;

public class Properties {
    public static final int WAIT_FOR_TIMEOUT = 60;
    public static final int DELAY_TIME = 2000;
    public static final String LOGIN_URL = "https://login.microsoftonline.com/common/oauth2/authorize?client_id=499b84ac-1321-427f-aa17-267" +
            "ca6975798&site_id=501454&response_mode=form_post&response_type=code+id_token&redirect_uri=https%3A%2F%2Fapp" +
            ".vssps.visualstudio.com%2F_signedin&nonce=c3acf225-a2a0-4291-9c1b-72d4a9a11998&state=realm%3Daex.dev.azure" +
            ".com%26reply_to%3Dhttps%253A%252F%252Faex.dev.azure.com%252Fsignup%253FacquisitionId%253Dfb45553e-ea7f-4eef-" +
            "b592-fbdb53ce7c13%2526acquisitionType%253DbyDefault%26ht%3D3%26mkt%3Den-US%26nonce%3Dc3acf225-a2a0-4291-9c1b" +
            "-72d4a9a11998&resource=https%3A%2F%2Fmanagement.core.windows.net%2F&cid=c3acf225-a2a0-4291-9c1b-72d4a9a1199" +
            "8&wsucxt=1&githubsi=true&msaoauth2=true&mkt=en-US";

    public static final String LOGIN_ACCOUNT_FIELD = "tangPeng55@outlook.com";
    public static final String LOGIN_PASSWORD_FIELD = "yyrnishiwode520,";

    public static final String AZURE_URL = "https://dev.azure.com/Azure-selenium-test";
    public static final String GIT_REPOSITORY_USERNAME = "dtang";
    public static final String GIT_REPOSITORY_PASSWORD_OR_PAT = "r6zpwzhcwao73sidxkhdzofoko6qnpgxnw4ewmafyh7l4srwwmtq";
    public static final String COMMAND_LINE = "Command line";
    public static final String GENERATE_STATIC_ANALYSIS_REPORT = "Generate static analysis report";
    public static final String PUBLISH_PARASOFT_RESULTS = "Publish Parasoft Results";
    public static final String ANALYZE_STATIC_ANALYSIS_REPORT = "Analyze static analysis report";
    public static final String SETTINGS_FIELD = "./dtp2023.properties";

    public static final String CLONE_JTEST_PROJECT_URL = "https://dtang0001@dev.azure.com/dtang0001/JavaProjectTemplate/_git/JavaProjectTemplate";
    public static final String JTEST_PROJECT_NAME = "JavaProjectTemplate";
    public static final String JTEST_STATIC_ANALYSIS_RESULTS_FILES_PATH = "**/build/reports/jtest/static/report.xml";
    public static final String JTEST_REPORT_TOOL_NAME = "Jtest";
    public static final String JTEST_NUMBER_OF_RULE_DOCS = "271";
    public static final String GENERATE_JTEST_STATIC_ANALYSIS_REPORT_COMMAND = "set \"JAVA_HOME=C:/Program Files/Java/jdk-11.0.17\"\n" +
            "mvn jtest:jtest -Djtest.config=\"./jtest_settings.properties\" -Djtest.settings=\"./localsettings.properties\" -Djtest.report=\"./build/reports/jtest/static\"";

    public static final String CLONE_DOTTEST_PROJECT_URL = "https://dtang0001@dev.azure.com/dtang0001/bankexample/_git/bankexample";
    public static final String DOTTEST_PROJECT_NAME = "BankExample";
    public static final String DOTTEST_STATIC_ANALYSIS_RESULTS_FILES_PATH = "**/build/reports/dottest/static/report.xml";
    public static final String DOTTEST_REPORT_TOOL_NAME = "dotTEST";
    public static final String DOTTEST_NUMBER_OF_RULE_DOCS = "1546";
    public static final String GENERATE_DOTTEST_STATIC_ANALYSIS_REPORT_COMMAND = "set \"DOTNET_HOME=C:/Program Files/dotnet\"\n" +
            "set \"Path=%DOTNET_HOME%;\"\n" +
            "\"C:/ParasoftTools/dottest/dottestcli.exe\" -solution \"BankExample.NET.sln\" -config \"./dottest_settings.properties\" -settings \"./localsettings.properties\" -report \"build/reports/dottest/static\"";
}

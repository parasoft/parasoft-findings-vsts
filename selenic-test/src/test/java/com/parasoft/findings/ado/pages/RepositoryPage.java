package com.parasoft.findings.ado.pages;

import com.parasoft.findings.ado.common.ElementUtils;
import com.parasoft.findings.ado.common.Properties;
import org.openqa.selenium.StaleElementReferenceException;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;
import org.openqa.selenium.support.PageFactory;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;

public class RepositoryPage {
    @FindBy(xpath = "/descendant::span[normalize-space(.)='Import']")
    private WebElement openImportRepositoryButton;

    @FindBy(id = "__bolt-textfield-input-4")
    private WebElement cloneURLInputField;

    @FindBy(css = ".margin-top-8 > .bolt-checkmark")
    private WebElement authenticationCheckbox;

    @FindBy(id = "__bolt-textfield-input-5")
    private WebElement usernameInputField;

    @FindBy(id = "__bolt-textfield-input-6")
    private WebElement passwordOrPATInputField;

    @FindBy(className = "repos-file-explorer-header-repo-link")
    private WebElement repositoryTitle;

    @FindBy(id = "__bolt-ms-vss-build-web-build-release-hub-group-link")
    private WebElement pipelinesTab;

    @FindBy(css = ".bolt-panel-footer-buttons > .primary")
    private WebElement importButton;

    @FindBy(className = "bolt-header-title")
    private WebElement fileName;

    @FindBy(id = "__bolt-settings-link")
    private WebElement projectSettings;

    private WebDriver driver;

    public RepositoryPage(WebDriver driver) {
        this.driver = driver;
        WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(Properties.WAIT_FOR_TIMEOUT));
        wait.ignoring(StaleElementReferenceException.class);
        PageFactory.initElements(driver, this);
    }

    public void clickOpenImportRepositoryButton() {
        ElementUtils.waitUntilVisible(driver, openImportRepositoryButton, Properties.WAIT_FOR_TIMEOUT);
        ElementUtils.clickElementUseJs(driver, openImportRepositoryButton);
    }

    public void setCloneURLInputField(String text) {
        ElementUtils.waitUntilVisible(driver, cloneURLInputField, Properties.WAIT_FOR_TIMEOUT);
        cloneURLInputField.sendKeys(text);
    }

    public void clickAuthenticationCheckbox() {
        ElementUtils.waitUntilVisible(driver, authenticationCheckbox, Properties.WAIT_FOR_TIMEOUT);
        ElementUtils.clickElementUseJs(driver, authenticationCheckbox);
    }

    public void setUsernameInputField(String text) {
        ElementUtils.waitUntilVisible(driver, usernameInputField, Properties.WAIT_FOR_TIMEOUT);
        usernameInputField.sendKeys(text);
    }

    public void setPasswordOrPATInputField(String text) {
        ElementUtils.waitUntilVisible(driver, passwordOrPATInputField, Properties.WAIT_FOR_TIMEOUT);
        passwordOrPATInputField.sendKeys(text);
    }

    public void clickImportButton() {
        ElementUtils.waitUntilClickable(driver, importButton, Properties.WAIT_FOR_TIMEOUT);
        ElementUtils.clickElementUseJs(driver, importButton);
    }

    public void clickPipelinesTab() {
        ElementUtils.waitUntilClickable(driver, repositoryTitle, Properties.WAIT_FOR_TIMEOUT);
        ElementUtils.clickElementUseJs(driver, pipelinesTab);
    }

    public String getFileName() {
        ElementUtils.waitUntilVisible(driver, fileName, Properties.WAIT_FOR_TIMEOUT);
        return fileName.getText();
    }

    public void clickProjectSettings() {
        ElementUtils.waitUntilVisible(driver, projectSettings, Properties.WAIT_FOR_TIMEOUT);
        ElementUtils.clickElementUseJs(driver, projectSettings);
    }
}

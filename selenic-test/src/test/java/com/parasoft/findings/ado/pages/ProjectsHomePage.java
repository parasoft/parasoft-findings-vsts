package com.parasoft.findings.ado.pages;

import com.parasoft.findings.ado.common.ElementUtils;
import com.parasoft.findings.ado.common.Properties;
import org.openqa.selenium.*;
import org.openqa.selenium.support.FindBy;
import org.openqa.selenium.support.PageFactory;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;

public class ProjectsHomePage {
    @FindBy(className = "create-project-button")
    private WebElement newProjectButton;

    @FindBy(className = "project-name-textfield-input")
    private WebElement projectNameInputField;

    @FindBy(css = ".create-button > .bolt-button-text")
    private WebElement createButton;

    @FindBy(id = "__bolt-settings-link")
    private WebElement projectSettings;

    @FindBy(id = "__bolt-ms-vss-code-web-code-hub-group-link")
    private WebElement reposTab;

    private WebDriver driver;

    public ProjectsHomePage(WebDriver driver) {
        this.driver = driver;
        WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(Properties.WAIT_FOR_TIMEOUT));
        wait.ignoring(StaleElementReferenceException.class);
        PageFactory.initElements(driver, this);
    }

    public void setProjectNameInputField(String text) {
        try{
            driver.findElement(By.className("create-project-button"));
            clickNewProjectButton();
        } finally {
            ElementUtils.waitUntilVisible(driver, projectNameInputField, Properties.WAIT_FOR_TIMEOUT);
            projectNameInputField.sendKeys(text);
        }
    }

    public void clickNewProjectButton() {
        ElementUtils.waitUntilVisible(driver, newProjectButton, Properties.WAIT_FOR_TIMEOUT);
        ElementUtils.clickElementUseJs(driver, newProjectButton);
    }

    public void clickCreateButton() {
        ElementUtils.waitUntilVisible(driver, createButton, Properties.WAIT_FOR_TIMEOUT);
        ElementUtils.clickElementUseJs(driver, createButton);
    }

    public void clickProjectSettings() {
        ElementUtils.waitUntilVisible(driver, projectSettings, Properties.WAIT_FOR_TIMEOUT);
        ElementUtils.clickElementUseJs(driver, projectSettings);
    }

    public void clickReposTab() {
        ElementUtils.waitUntilVisible(driver, reposTab, Properties.WAIT_FOR_TIMEOUT);
        ElementUtils.clickElementUseJs(driver, reposTab);
    }
}
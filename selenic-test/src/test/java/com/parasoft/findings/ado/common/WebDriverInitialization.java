package com.parasoft.findings.ado.common;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;

public class WebDriverInitialization {
    public static WebDriver init() {
        ChromeOptions opts = new ChromeOptions();
        opts.addArguments("--start-maximized");
        opts.addArguments("--disable-geolocation");
        opts.addArguments("--incognito");
        opts.addArguments("--enable-strict-powerful-feature-restrictions");
        opts.addArguments("--remote-allow-origins=*");
        return new ChromeDriver(opts);
    }
}
